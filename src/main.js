import { Actor, log } from 'apify';
import { classifyEvents, detectCompanies, scoreSentiment } from './enrich.js';
import { DEFAULT_PRESET, FEED_PRESETS, createParser } from './feeds.js';
import { addFullText } from './fulltext.js';
import { deriveStateKey, loadSeenArticles, saveSeenArticles } from './state.js';
import {
    MAX_HEADLINE_LENGTH,
    articleSearchText,
    buildGoogleNewsFeeds,
    buildStatusMessage,
    buildTickerFeeds,
    canonicalizeUrl,
    cleanText,
    containsAnyKeyword,
    containsExcludedKeyword,
    detectTickers,
    matchesCompanyFilter,
    matchesTickerFilter,
    resolveIncludeKeywords,
    resolveRunStatus,
    sanitizeHttpUrl,
    stripPublisherSuffix,
    truncate,
    validateCustomFeeds,
} from './utils.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FEED_RETRIES = 1;
const DATASET_ITEM_EVENT = 'apify-default-dataset-item';

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function warn(warnings, message) {
    warnings.push(message);
    log.warning(message);
}

function resolvePreset(input, warnings) {
    const presetName = input.feedPreset || DEFAULT_PRESET;

    if (presetName === 'custom') {
        const { valid, skipped } = validateCustomFeeds(input.feeds || []);
        for (const entry of skipped) {
            warn(warnings, `Skipped ${entry.feed ? String(entry.feed) : 'custom feeds'}: ${entry.reason}`);
        }
        return { feeds: valid, useDefaultKeywords: true };
    }

    if (!FEED_PRESETS[presetName]) {
        warn(warnings, `Unknown feedPreset "${presetName}" — using ${DEFAULT_PRESET} defaults.`);
        return FEED_PRESETS[DEFAULT_PRESET];
    }

    return FEED_PRESETS[presetName];
}

function feedLabel(feed) {
    if (feed.ticker) return `${feed.name} (${feed.ticker})`;
    if (feed.query) return `${feed.name}: ${feed.query}`;
    return feed.name;
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

function maxChargeableItems() {
    try {
        return Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(DATASET_ITEM_EVENT);
    } catch {
        return Infinity;
    }
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

function normalizeItem(item, feed, parsedFeed, fetchedAt, enrich) {
    const publisher = textFromSourceField(item.source);
    const headline = feed.query
        ? stripPublisherSuffix(truncate(item.title, MAX_HEADLINE_LENGTH), publisher)
        : truncate(item.title, MAX_HEADLINE_LENGTH);
    const articleLink = canonicalizeUrl(item.link || item.guid);
    const published = parseDate(item.isoDate || item.pubDate || item.published || item.updated);

    // Google News descriptions only repeat the headline and publisher.
    const rawSummary = feed.query ? '' : item.contentSnippet
        || item.summary
        || item.description
        || item.content
        || item.contentEncoded
        || '';

    const summary = truncate(rawSummary);
    const searchable = articleSearchText(headline, summary);
    const tickers = detectTickers(searchable);
    if (feed.ticker && !tickers.includes(feed.ticker)) tickers.unshift(feed.ticker);

    const companyDetails = detectCompanies(searchable, tickers);
    for (const company of companyDetails) {
        if (!tickers.includes(company.ticker)) tickers.push(company.ticker);
    }

    const source = publisher
        || feed.name
        || cleanText(parsedFeed.title || '')
        || hostnameFromUrl(articleLink)
        || hostnameFromUrl(feed.url)
        || 'Unknown';

    const article = {
        headline,
        source,
        author: extractAuthor(item),
        publishedDate: published ? published.toISOString() : null,
        articleLink,
        summary,
        categories: extractCategories(item),
        imageUrl: extractImageUrl(item),
        tickers,
        dedupeKey: articleLink || `${source}:${headline}`.toLowerCase(),
        sourceFeed: feed.url,
        searchQuery: feed.query || null,
        fetchedAt,
    };

    if (enrich) {
        const sentiment = scoreSentiment(headline, summary);
        article.companyDetails = companyDetails;
        article.eventTypes = classifyEvents(searchable);
        article.sentimentScore = sentiment.score;
        article.sentimentLabel = sentiment.label;
    }

    return article;
}

function processFeedItems(parsedFeed, feed, fetchedAt, filters, options) {
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
        const normalized = normalizeItem(item, feed, parsedFeed, fetchedAt, options.enrich);
        if (!normalized.headline || !normalized.articleLink) continue;

        const searchable = articleSearchText(normalized.headline, normalized.summary);

        if (!containsAnyKeyword(searchable, includeKeywords)) continue;
        if (containsExcludedKeyword(searchable, excludeKeywords)) continue;

        // Search results already match the user's query, so entity filters apply only to other feeds.
        if (!feed.query) {
            if (!matchesTickerFilter(searchable, tickers, tickerMatchMode, normalized.tickers)) continue;
            if (!matchesCompanyFilter(searchable, companies)) continue;
        }

        if (cutoffMs && normalized.publishedDate) {
            const publishedMs = Date.parse(normalized.publishedDate);
            if (!Number.isNaN(publishedMs) && publishedMs < cutoffMs) continue;
        }

        items.push(normalized);
        if (options.maxItemsPerFeed && items.length >= options.maxItemsPerFeed) break;
    }

    return items;
}

function mergeDuplicate(existing, item) {
    for (const ticker of item.tickers) {
        if (!existing.tickers.includes(ticker)) existing.tickers.push(ticker);
    }
    if (existing.companyDetails && item.companyDetails) {
        for (const company of item.companyDetails) {
            if (!existing.companyDetails.some((c) => c.ticker === company.ticker)) existing.companyDetails.push(company);
        }
    }
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

await Actor.main(async () => {
    const fetchedAt = new Date().toISOString();
    const warnings = [];
    let feedsRequested = 0;
    let failOnAllFeedsFailed = false;
    let failMessage = null;

    try {
        const input = await Actor.getInput() || {};
        failOnAllFeedsFailed = input.failOnAllFeedsFailed === true;

        const maxItems = Math.min(Math.max(Number(input.maxItems ?? 50), 1), 500);
        const hoursBack = Math.max(Number(input.hoursBack ?? 24), 0);
        const excludeKeywords = Array.isArray(input.excludeKeywords) ? input.excludeKeywords : [];
        const tickers = Array.isArray(input.tickers) ? input.tickers : [];
        const companies = Array.isArray(input.companies) ? input.companies : [];
        const searchQueries = Array.isArray(input.searchQueries) ? input.searchQueries : [];
        const tickerMatchMode = input.tickerMatchMode === 'all' ? 'all' : 'any';
        const deduplicate = input.deduplicate !== false;
        const enrich = input.enrichArticles !== false;
        const onlyNewArticles = input.onlyNewArticles === true;
        const includeFullText = input.includeFullText === true;
        const fullTextMaxChars = Math.min(Math.max(Number(input.fullTextMaxChars ?? 10_000), 500), 50_000);
        const maxItemsPerFeed = input.maxItemsPerFeed
            ? Math.min(Math.max(Number(input.maxItemsPerFeed), 1), 500)
            : null;
        const requestTimeoutMs = Math.min(Math.max(Number(input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS), 5_000), 120_000);
        const feedRetries = Math.min(Math.max(Number(input.feedRetries ?? DEFAULT_FEED_RETRIES), 0), 3);
        const cutoffMs = hoursBack > 0 ? Date.now() - hoursBack * 60 * 60 * 1000 : 0;

        const preset = resolvePreset(input, warnings);
        let feeds = [...preset.feeds];

        if (tickers.length && input.useTickerFeeds !== false) {
            const { feeds: tickerFeeds, skipped } = buildTickerFeeds(tickers);
            for (const entry of skipped) warn(warnings, `Ticker feed skipped for ${entry.ticker}: ${entry.reason}`);
            feeds.push(...tickerFeeds);
        }

        if (searchQueries.length) {
            const { feeds: searchFeeds, skipped } = buildGoogleNewsFeeds(searchQueries, {
                language: input.searchLanguage,
                country: input.searchCountry,
                hoursBack,
            });
            for (const entry of skipped) warn(warnings, `Search query skipped "${entry.query}": ${entry.reason}`);
            feeds.push(...searchFeeds);
        }

        if (!feeds.length) {
            warn(warnings, `No feeds, tickers, or search queries to fetch — using ${DEFAULT_PRESET} defaults.`);
            feeds = [...FEED_PRESETS[DEFAULT_PRESET].feeds];
        }
        feedsRequested = feeds.length;

        const { keywords: includeKeywords, warning: keywordWarning } = resolveIncludeKeywords({
            includeKeywords: input.includeKeywords,
            tickers,
            companies,
            searchQueries,
            useDefaultKeywords: preset.useDefaultKeywords,
        });
        if (keywordWarning) warn(warnings, keywordWarning);

        const parser = createParser(requestTimeoutMs);
        const filters = { includeKeywords, excludeKeywords, tickers, companies, tickerMatchMode, cutoffMs };

        await Actor.setStatusMessage(`Fetching ${feeds.length} feed(s) in parallel...`);

        const feedResults = await Promise.allSettled(
            feeds.map(async (feed) => {
                const parsedFeed = await parseFeedWithRetries(parser, feed, feedRetries);
                const items = processFeedItems(parsedFeed, feed, fetchedAt, filters, { enrich, maxItemsPerFeed });
                log.info(`Fetched ${parsedFeed.items?.length || 0} item(s), kept ${items.length} from ${feedLabel(feed) || feed.url}`);
                return { itemCount: parsedFeed.items?.length || 0, items };
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
                    name: feedLabel(feed),
                    status: 'ok',
                    rawItems: outcome.value.itemCount,
                    keptItems: outcome.value.items.length,
                });
            } else {
                const errorMessage = outcome.reason?.message || String(outcome.reason);
                failures.push({ feed: feed.url, name: feedLabel(feed), error: errorMessage });
                feedStats.push({ feed: feed.url, name: feedLabel(feed), status: 'failed', error: errorMessage });
                log.warning(`Feed permanently failed: ${feed.url} — ${errorMessage}`);
            }
        }

        const byKey = new Map();
        let candidates = [];

        for (const item of results) {
            const existing = deduplicate ? byKey.get(item.dedupeKey) : null;
            if (existing) {
                mergeDuplicate(existing, item);
                continue;
            }
            byKey.set(item.dedupeKey, item);
            candidates.push(item);
        }

        candidates.sort((a, b) => {
            const aDate = a.publishedDate ? Date.parse(a.publishedDate) : 0;
            const bDate = b.publishedDate ? Date.parse(b.publishedDate) : 0;
            return bDate - aDate;
        });

        let seenState = null;
        let skippedAlreadySeen = 0;
        if (onlyNewArticles) {
            const stateKey = deriveStateKey({
                stateKey: input.stateKey,
                feeds,
                tickers,
                companies,
                searchQueries,
                includeKeywords,
                excludeKeywords,
            });
            const { store, seen } = await loadSeenArticles(stateKey);
            seenState = { store, seen, stateKey };
            const before = candidates.length;
            candidates = candidates.filter((item) => !seen[item.dedupeKey]);
            skippedAlreadySeen = before - candidates.length;
            log.info(`Skipped ${skippedAlreadySeen} article(s) already returned by earlier runs (state key ${stateKey}).`);
        }

        let output = candidates.slice(0, maxItems);
        const chargeableItems = maxChargeableItems();
        const spendingLimitReached = output.length > chargeableItems;
        if (spendingLimitReached) {
            output = output.slice(0, chargeableItems);
            log.warning(`Output cut to ${chargeableItems} article(s) to stay within your maximum cost per run.`);
        }

        let fullTextStats = null;
        if (includeFullText && output.length) {
            await Actor.setStatusMessage(`Fetching full text for ${output.length} article(s)...`);
            fullTextStats = await addFullText(output, { timeoutMs: requestTimeoutMs, maxChars: fullTextMaxChars });
            log.info('Full text results', fullTextStats);
        }

        if (output.length) {
            await Actor.pushData(output);
        }

        if (seenState && output.length) {
            await saveSeenArticles(seenState.store, seenState.stateKey, seenState.seen, output.map((item) => item.dedupeKey));
        }

        const feedsSucceeded = feedStats.filter((s) => s.status === 'ok').length;
        const runStatus = resolveRunStatus({
            feedsSucceeded,
            itemCount: output.length,
            failures,
            skippedAlreadySeen,
        });

        if (runStatus === 'all_feeds_failed') {
            warnings.push(`All ${feeds.length} feed(s) failed. Check OUTPUT.failures for details.`);
        } else if (runStatus === 'no_items') {
            warnings.push('Feeds returned data but no articles matched your filters.');
        }

        const statusMessage = buildStatusMessage({
            itemCount: output.length,
            feedsRequested: feeds.length,
            failures,
            runStatus,
            warnings,
            spendingLimitReached,
        });

        await finishRun({
            count: output.length,
            fetchedAt,
            runStatus,
            statusMessage,
            feedsRequested: feeds.length,
            feedsSucceeded,
            feedsFailed: failures.length,
            onlyNewArticles,
            skippedAlreadySeen,
            stateKey: seenState?.stateKey ?? null,
            spendingLimitReached,
            fullTextStats,
            warnings,
            feedStats,
            failures,
        });

        if (failOnAllFeedsFailed && runStatus === 'all_feeds_failed') failMessage = statusMessage;
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
            onlyNewArticles: false,
            skippedAlreadySeen: 0,
            stateKey: null,
            spendingLimitReached: false,
            fullTextStats: null,
            warnings: [error.message],
            feedStats: [],
            failures: [{ feed: null, name: null, error: error.message }],
        });

        if (failOnAllFeedsFailed) failMessage = statusMessage;
    }

    if (failMessage) await Actor.fail(failMessage);
});
