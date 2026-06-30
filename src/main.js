import { Actor, log } from 'apify';
import Parser from 'rss-parser';
import striptags from 'striptags';
import { decode } from 'html-entities';

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

const DEFAULT_INCLUDE_KEYWORDS = [
    'stock', 'stocks', 'market', 'markets', 'equity', 'equities', 'shares',
    's&p', 'dow', 'nasdaq', 'earnings', 'ipo', 'nifty', 'sensex',
];

const TICKER_FALSE_POSITIVES = new Set([
    'A', 'AI', 'AM', 'AN', 'API', 'ARE', 'AS', 'AT', 'BE', 'BIG', 'CAN', 'CEO', 'CO',
    'DAY', 'DO', 'ETF', 'EU', 'FDA', 'FOR', 'GDP', 'GO', 'HAS', 'HE', 'HER', 'HIS',
    'IF', 'IN', 'IPO', 'IS', 'IT', 'ITS', 'LOW', 'NEW', 'NO', 'NOT', 'OF', 'ON',
    'OR', 'OUR', 'OUT', 'PM', 'SO', 'THE', 'TO', 'UK', 'UP', 'US', 'USD', 'VS', 'WE',
]);

const USER_AGENT = 'Mozilla/5.0 (compatible; ApifyStockMarketNewsActor/1.0; +https://apify.com/)';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FEED_RETRIES = 1;
const FREE_TIER_MAX_ITEMS = 25;

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

function cleanText(value = '') {
    return decode(striptags(String(value)))
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(value = '', maxLength = 320) {
    const text = cleanText(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}…`;
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeFeed(feed) {
    if (typeof feed === 'string') {
        return { name: null, url: feed };
    }

    if (feed && typeof feed === 'object' && typeof feed.url === 'string') {
        return {
            name: typeof feed.name === 'string' ? feed.name : null,
            url: feed.url,
        };
    }

    return null;
}

function resolveFeeds(input) {
    const preset = input.feedPreset || 'us_markets';

    if (preset === 'custom') {
        const custom = (input.feeds || []).map(normalizeFeed).filter(Boolean);
        return custom.length ? custom : DEFAULT_FEEDS;
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

function canonicalizeUrl(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        for (const key of [...parsed.searchParams.keys()]) {
            if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return url;
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

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text, keyword) {
    const kw = String(keyword).toLowerCase().trim();
    if (!kw) return false;

    const lower = text.toLowerCase();

    if (kw.includes(' ') || /[&]/.test(kw)) {
        return lower.includes(kw);
    }

    if (kw.length <= 4) {
        return new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text);
    }

    return lower.includes(kw);
}

function containsAnyKeyword(text, keywords) {
    if (!keywords?.length) return true;
    return keywords.some((keyword) => matchesKeyword(text, keyword));
}

function containsExcludedKeyword(text, keywords) {
    if (!keywords?.length) return false;
    return keywords.some((keyword) => matchesKeyword(text, keyword));
}

function articleSearchText(headline, summary) {
    return `${headline} ${summary}`.trim();
}

function detectTickers(text) {
    const found = new Set();
    const patterns = [
        /\$([A-Z]{1,5})\b/g,
        /\(([A-Z]{1,5})\)/g,
        /(?:NASDAQ|NYSE|AMEX|OTC):\s*([A-Z]{1,5})\b/g,
        /\b([A-Z]{2,5})\s+(?:stock|shares|equity|ticker)\b/g,
    ];

    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const symbol = (match[1] || match[2] || match[3] || '').toUpperCase();
            if (symbol && symbol.length >= 2 && !TICKER_FALSE_POSITIVES.has(symbol)) {
                found.add(symbol);
            }
        }
    }

    return [...found];
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
        return media.url || media.$?.url || null;
    }

    return null;
}

function matchesTickerFilter(searchable, tickers, matchMode) {
    if (!tickers?.length) return true;

    const upperText = searchable.toUpperCase();
    const detected = detectTickers(searchable);
    const normalizedTickers = tickers.map((t) => String(t).replace(/^\$/, '').toUpperCase());

    const matches = normalizedTickers.map((ticker) => {
        if (detected.includes(ticker)) return true;
        return new RegExp(`\\b\\$?${escapeRegex(ticker)}\\b`, 'i').test(upperText);
    });

    return matchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

function matchesCompanyFilter(searchable, companies) {
    if (!companies?.length) return true;
    const lower = searchable.toLowerCase();
    return companies.some((company) => lower.includes(String(company).toLowerCase()));
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
    const headline = cleanText(item.title);
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

function resolveRunStatus({ feedsSucceeded, feedsRequested, itemCount, failures }) {
    if (feedsSucceeded === 0) return 'all_feeds_failed';
    if (itemCount === 0) return 'no_items';
    if (failures.length > 0) return 'partial';
    return 'ok';
}

function buildStatusMessage({ output, feedsRequested, failures, freeTier, runStatus, warnings }) {
    const parts = [`Saved ${output.length} news item(s).`];

    if (runStatus === 'all_feeds_failed') {
        parts.push(`All ${feedsRequested} feed(s) failed — see OUTPUT.failures.`);
    } else if (runStatus === 'no_items') {
        parts.push('No articles matched your filters.');
    } else if (failures.length) {
        parts.push(`${failures.length}/${feedsRequested} feed failure(s).`);
    }

    if (freeTier) parts.push(`Free tier: max ${FREE_TIER_MAX_ITEMS} items.`);
    if (warnings.length && runStatus !== 'no_items' && runStatus !== 'all_feeds_failed') {
        parts.push(warnings[0]);
    }

    return parts.join(' ');
}

async function finishRun(summary) {
    await Actor.setValue('OUTPUT', JSON.stringify(summary, null, 2), { contentType: 'application/json' });
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

    try {
        const input = await Actor.getInput() || {};

        let feeds = resolveFeeds(input);
        if (!feeds.length) {
            warnings.push('No valid feeds in input — using built-in defaults.');
            feeds = DEFAULT_FEEDS;
        }

        const freeTier = isFreeTierUser();

        let maxItems = Math.min(Math.max(Number(input.maxItems ?? 50), 1), 500);
        if (freeTier) {
            maxItems = Math.min(maxItems, FREE_TIER_MAX_ITEMS);
            log.info(`Free-tier user: output capped at ${FREE_TIER_MAX_ITEMS} items. Upgrade for up to 500.`);
        }

        const hoursBack = Math.max(Number(input.hoursBack ?? 24), 0);
        const includeKeywords = Array.isArray(input.includeKeywords)
            ? input.includeKeywords
            : DEFAULT_INCLUDE_KEYWORDS;
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
            items: output,
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
            feedsRequested: 0,
            feedsSucceeded: 0,
            feedsFailed: 0,
            freeTierLimited: false,
            warnings: [error.message],
            feedStats: [],
            items: [],
            failures: [{ feed: null, name: null, error: error.message }],
        });
    }
});
