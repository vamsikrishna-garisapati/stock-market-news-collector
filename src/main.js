import { Actor, log } from 'apify';
import Parser from 'rss-parser';
import {
    DEFAULT_INCLUDE_KEYWORDS,
    FREE_TIER_MAX_ITEMS,
    MAX_HEADLINE_LENGTH,
    articleSearchText,
    buildStatusMessage,
    canonicalizeUrl,
    cleanText,
    containsAnyKeyword,
    containsExcludedKeyword,
    detectTickers,
    matchesCompanyFilter,
    matchesTickerFilter,
    resolveRunStatus,
    sanitizeHttpUrl,
    truncate,
    validateCustomFeeds,
} from './utils.js';

const DEFAULT_FEEDS = [
    { name: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
    { name: 'MarketWatch Market Pulse', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
    { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
];

const FEED_PRESETS = {
    us_markets: DEFAULT_FEEDS,
    global_markets: [
        { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
        { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
        { name: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
    ],
    earnings: [
        { name: 'MarketWatch Market Pulse', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
        { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
        { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
    ],
};

const USER_AGENT = 'Mozilla/5.0 (compatible; ApifyStockMarketNewsActor/1.0; +https://apify.com/)';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FEED_RETRIES = 1;

function createParser(timeoutMs) {
    return new Parser({
        timeout: timeoutMs,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        customFields: {
            item: [
                ['content:encoded', 'contentEncoded'],
                ['dc:creator', 'dcCreator'],
                ['media:content', 'mediaContent'],
                'source',
            ],
        },
    });
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function resolveFeeds(input, warnings) {
    const preset = input.feedPreset || 'us_markets';

    if (preset === 'custom') {
        const { valid, skipped } = validateCustomFeeds(input.feeds || []);
        for (const entry of skipped) {
            const label = entry.feed ? String(entry.feed) : 'custom feeds';
            warnings.push(`Skipped ${label}: ${entry.reason}`);
            log.warning(`Skipped custom feed: ${label} — ${entry.reason}`);
        }
        return valid.length ? valid : DEFAULT_FEEDS;
    }

    if (!FEED_PRESETS[preset]) {
        warnings.push(`Unknown feedPreset "${preset}" — using us_markets defaults.`);
        log.warning(`Unknown feedPreset "${preset}" — falling back to us_markets defaults.`);
    }

    return FEED_PRESETS[preset] || DEFAULT_FEEDS;
}

function hostnameFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function textFromSourceField(source) {
    if (!source) return null;
    if (typeof source === 'string') return cleanText(source);
    if (typeof source === 'object') {
        return cleanText(source._ || source['#'] || source.title || source.name || '');
    }
    return null;
}

function extractCategories(item) {
    if (!item.categories) return [];

    const raw = Array.isArray(item.categories) ? item.categories : [item.categories];
    return raw
        .map((category) => {
            if (typeof category === 'string') return cleanText(category);
            if (typeof category === 'object') return cleanText(category._ || category['#'] || category.term || '');
            return '';
        })
        .filter(Boolean);
}

function extractAuthor(item) {
    const raw = item.creator || item.dcCreator || item.author;
    if (!raw) return null;
    if (typeof raw === 'string') return cleanText(raw) || null;
    if (typeof raw === 'object') return cleanText(raw._ || raw['#'] || raw.name || '') || null;
    return null;
}

function extractImageUrl(item) {
    const media = item.mediaContent || item.enclosure;
    if (!media) return null;

    if (typeof media === 'object') {
        return sanitizeHttpUrl(media.url || media.$?.url || null);
    }

    return null;
}

function isFreeTierUser() {
    const { userIsPaying } = Actor.getEnv();
    return userIsPaying === 0;
}

async function parseFeedWithRetries(parser, feed, retries) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await parser.parseURL(feed.url);
        } catch (error) {
            lastError = error;
            const delayMs = 500 * (attempt + 1);
            log.warning(`Feed failed: ${feed.url}. Attempt ${attempt + 1}/${retries + 1}. ${error.message}`);
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}

function normalizeItem(item, feed, parsedFeed, fetchedAt) {
    const headline = truncate(item.title, MAX_HEADLINE_LENGTH);
    const articleLink = canonicalizeUrl(item.link || item.guid);
    const published = parseDate(item.isoDate || item.pubDate || item.published || item.updated);

    const rawSummary = item.contentSnippet
        || item.summary
        || item.description
        || item.content
        || item.contentEncoded
        || '';

    const summary = truncate(rawSummary);
    const searchable = articleSearchText(headline, summary);

    const source = textFromSourceField(item.source)
        || feed.name
        || cleanText(parsedFeed.title || '')
        || hostnameFromUrl(articleLink)
        || hostnameFromUrl(feed.url)
        || 'Unknown';

    return {
        headline,
        source,
        author: extractAuthor(item),
        publishedDate: published ? published.toISOString() : null,
        articleLink,
        summary,
        categories: extractCategories(item),
        imageUrl: extractImageUrl(item),
        tickers: detectTickers(searchable),
        dedupeKey: articleLink || `${source}:${headline}`.toLowerCase(),
        sourceFeed: feed.url,
        fetchedAt,
    };
}

async function finishRun(summary) {
    await Actor.setValue('OUTPUT', summary);
    await Actor.setStatusMessage(summary.statusMessage);
    log.info('Run summary', {
        runStatus: summary.runStatus,
        count: summary.count,
        feedsSucceeded: summary.feedsSucceeded,
        feedsFailed: summary.feedsFailed,
    });
}

function processFeedItems(parsedFeed, feed, fetchedAt, filters, maxItemsPerFeed) {
    const {
        includeKeywords,
        excludeKeywords,
        tickers,
        companies,
        tickerMatchMode,
        cutoffMs,
    } = filters;

    const items = [];

    for (const item of parsedFeed.items || []) {
        const normalized = normalizeItem(item, feed, parsedFeed, fetchedAt);
        if (!normalized.headline || !normalized.articleLink) continue;

        const searchable = articleSearchText(normalized.headline, normalized.summary);

        if (!containsAnyKeyword(searchable, includeKeywords)) continue;
        if (containsExcludedKeyword(searchable, excludeKeywords)) continue;
        if (!matchesTickerFilter(searchable, tickers, tickerMatchMode)) continue;
        if (!matchesCompanyFilter(searchable, companies)) continue;

        if (cutoffMs && normalized.publishedDate) {
            const publishedMs = Date.parse(normalized.publishedDate);
            if (!Number.isNaN(publishedMs) && publishedMs < cutoffMs) continue;
        }

        items.push(normalized);
        if (maxItemsPerFeed && items.length >= maxItemsPerFeed) break;
    }

    return items;
}

await Actor.main(async () => {
    const fetchedAt = new Date().toISOString();
    const warnings = [];
    let feedsRequested = 0;

    try {
        const input = await Actor.getInput() || {};

        let feeds = resolveFeeds(input, warnings);
        if (!feeds.length) {
            warnings.push('No valid feeds in input — using built-in defaults.');
            feeds = DEFAULT_FEEDS;
        }
        feedsRequested = feeds.length;

        const freeTier = isFreeTierUser();

        let maxItems = Math.min(Math.max(Number(input.maxItems ?? 50), 1), 500);
        if (freeTier) {
            maxItems = Math.min(maxItems, FREE_TIER_MAX_ITEMS);
            log.info(`Free-tier user: output capped at ${FREE_TIER_MAX_ITEMS} items. Upgrade for up to 500.`);
        }

        const hoursBack = Math.max(Number(input.hoursBack ?? 24), 0);
        let includeKeywords = DEFAULT_INCLUDE_KEYWORDS;
        if (Array.isArray(input.includeKeywords)) {
            includeKeywords = input.includeKeywords;
        } else if (input.includeKeywords != null) {
            warnings.push('includeKeywords must be an array — using default finance keywords.');
            log.warning('includeKeywords must be an array — using default finance keywords.');
        }
        const excludeKeywords = Array.isArray(input.excludeKeywords) ? input.excludeKeywords : [];
        const tickers = Array.isArray(input.tickers) ? input.tickers : [];
        const companies = Array.isArray(input.companies) ? input.companies : [];
        const tickerMatchMode = input.tickerMatchMode === 'all' ? 'all' : 'any';
        const deduplicate = input.deduplicate !== false;
        const maxItemsPerFeed = input.maxItemsPerFeed
            ? Math.min(Math.max(Number(input.maxItemsPerFeed), 1), 500)
            : null;
        const requestTimeoutMs = Math.min(Math.max(Number(input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS), 5_000), 120_000);
        const feedRetries = Math.min(Math.max(Number(input.feedRetries ?? DEFAULT_FEED_RETRIES), 0), 3);
        const cutoffMs = hoursBack > 0 ? Date.now() - hoursBack * 60 * 60 * 1000 : 0;

        const parser = createParser(requestTimeoutMs);
        const filters = {
            includeKeywords,
            excludeKeywords,
            tickers,
            companies,
            tickerMatchMode,
            cutoffMs,
        };

        await Actor.setStatusMessage(`Fetching ${feeds.length} feed(s) in parallel...`);

        const feedResults = await Promise.allSettled(
            feeds.map(async (feed) => {
                const parsedFeed = await parseFeedWithRetries(parser, feed, feedRetries);
                const items = processFeedItems(parsedFeed, feed, fetchedAt, filters, maxItemsPerFeed);
                log.info(`Fetched ${parsedFeed.items?.length || 0} item(s), kept ${items.length} from ${feed.name || feed.url}`);
                return { feed, itemCount: parsedFeed.items?.length || 0, items };
            }),
        );

        const results = [];
        const failures = [];
        const feedStats = [];

        for (let i = 0; i < feedResults.length; i += 1) {
            const feed = feeds[i];
            const outcome = feedResults[i];

            if (outcome.status === 'fulfilled') {
                results.push(...outcome.value.items);
                feedStats.push({
                    feed: feed.url,
                    name: feed.name,
                    status: 'ok',
                    rawItems: outcome.value.itemCount,
                    keptItems: outcome.value.items.length,
                });
            } else {
                const errorMessage = outcome.reason?.message || String(outcome.reason);
                failures.push({ feed: feed.url, name: feed.name, error: errorMessage });
                feedStats.push({
                    feed: feed.url,
                    name: feed.name,
                    status: 'failed',
                    error: errorMessage,
                });
                log.warning(`Feed permanently failed: ${feed.url} — ${errorMessage}`);
            }
        }

        const seen = new Set();
        const deduped = [];

        for (const item of results) {
            const key = item.dedupeKey;
            if (deduplicate && seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }

        deduped.sort((a, b) => {
            const aDate = a.publishedDate ? Date.parse(a.publishedDate) : 0;
            const bDate = b.publishedDate ? Date.parse(b.publishedDate) : 0;
            return bDate - aDate;
        });

        const output = deduped.slice(0, maxItems);
        const feedsSucceeded = feedStats.filter((s) => s.status === 'ok').length;
        const runStatus = resolveRunStatus({
            feedsSucceeded,
            feedsRequested: feeds.length,
            itemCount: output.length,
            failures,
        });

        if (runStatus === 'all_feeds_failed') {
            warnings.push(`All ${feeds.length} feed(s) failed. Check OUTPUT.failures for details.`);
        } else if (runStatus === 'no_items') {
            warnings.push('Feeds returned data but no articles matched your filters.');
        }

        if (output.length) {
            await Actor.pushData(output);
        }

        const statusMessage = buildStatusMessage({
            output,
            feedsRequested: feeds.length,
            failures,
            freeTier,
            runStatus,
            warnings,
        });

        await finishRun({
            count: output.length,
            fetchedAt,
            runStatus,
            statusMessage,
            feedsRequested: feeds.length,
            feedsSucceeded,
            feedsFailed: failures.length,
            freeTierLimited: freeTier,
            warnings,
            feedStats,
            failures,
        });
    } catch (error) {
        log.exception(error, 'Unexpected error — finishing run gracefully');
        const statusMessage = `Run completed with errors: ${error.message}`;

        await finishRun({
            count: 0,
            fetchedAt,
            runStatus: 'error',
            statusMessage,
            feedsRequested,
            feedsSucceeded: 0,
            feedsFailed: 0,
            freeTierLimited: false,
            warnings: [error.message],
            feedStats: [],
            failures: [{ feed: null, name: null, error: error.message }],
        });
    }
});
