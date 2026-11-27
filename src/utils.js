import striptags from 'striptags';
import { decode } from 'html-entities';

export const DEFAULT_INCLUDE_KEYWORDS = [
    'stock', 'stocks', 'market', 'markets', 'equity', 'equities', 'shares',
    's&p', 'dow', 'nasdaq', 'earnings', 'ipo', 'nifty', 'sensex',
];

export const TICKER_FALSE_POSITIVES = new Set([
    // Common English words / generic abbreviations
    'A', 'AI', 'AM', 'AN', 'API', 'ARE', 'AS', 'AT', 'BE', 'BIG', 'CAN', 'CEO', 'CO',
    'DAY', 'DO', 'ETF', 'EU', 'FDA', 'FOR', 'GDP', 'GO', 'HAS', 'HE', 'HER', 'HIS',
    'IF', 'IN', 'IPO', 'IS', 'IT', 'ITS', 'LOW', 'NEW', 'NO', 'NOT', 'OF', 'ON',
    'OR', 'OUR', 'OUT', 'PM', 'SO', 'THE', 'TO', 'UK', 'UP', 'US', 'USD', 'VS', 'WE',
    // Indian regulatory bodies, exchanges, and financial acronyms (not tickers)
    'RBI', 'NSE', 'BSE', 'SEBI', 'NIFTY', 'GST', 'UPI', 'FPI', 'FDI', 'FII',
    'PAT', 'EPS', 'YOY', 'QOQ', 'NII', 'NPA', 'ROE', 'ROA', 'EBIT', 'EBITDA',
    // Global macro / central bank acronyms (not tickers)
    'CPI', 'PPI', 'IMF', 'WTO', 'BOE', 'ECB', 'PCE', 'PMI', 'PBoC',
    // Currency codes that frequently appear in Indian and global finance text
    'INR', 'CAD', 'AUD', 'CHF', 'JPY', 'GBP', 'EUR',
]);

export const MAX_CUSTOM_FEEDS = 20;
export const MAX_TICKER_FEEDS = 20;
export const MAX_SEARCH_QUERIES = 10;
export const MAX_HEADLINE_LENGTH = 500;

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;
const LANGUAGE_PATTERN = /^[a-z]{2}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', '.tsrc']);

export function cleanText(value = '') {
    return decode(striptags(String(value)))
        .replace(/\s+/g, ' ')
        .trim();
}

export function truncate(value = '', maxLength = 320) {
    const text = cleanText(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}…`;
}

export function isValidHttpUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function sanitizeHttpUrl(url) {
    if (!url || !isValidHttpUrl(url)) return null;
    return url;
}

export function canonicalizeUrl(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }

        for (const key of [...parsed.searchParams.keys()]) {
            if (/^utm_/i.test(key) || TRACKING_PARAMS.has(key.toLowerCase())) {
                parsed.searchParams.delete(key);
            }
        }
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return null;
    }
}

const GOOGLE_NEWS_HOST = 'news.google.com';
const GOOGLE_NEWS_BATCHEXECUTE_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
const PUBLISHER_URL_RESOLVE_CONCURRENCY = 5;
const DEFAULT_RESOLVE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** True for Google News article/read wrapper URLs (including RSS article links). */
export function isGoogleNewsArticleUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        if (parsed.hostname.toLowerCase() !== GOOGLE_NEWS_HOST) return false;
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return false;
        const kind = parts[parts.length - 2];
        return kind === 'articles' || kind === 'read';
    } catch {
        return false;
    }
}

/** Article id segment from a Google News wrapper URL, or null. */
export function googleNewsArticleId(url) {
    if (!isGoogleNewsArticleUrl(url)) return null;
    try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        return parts[parts.length - 1] || null;
    } catch {
        return null;
    }
}

function firstMatch(text, pattern) {
    const match = text.match(pattern);
    return match?.[1] || null;
}

function parseBatchexecutePublisherUrl(body) {
    if (!body || typeof body !== 'string') return null;

    const stripped = body.replace(/^\)\]\}'\s*/, '');
    const jsonChunk = stripped.includes('\n\n') ? stripped.split('\n\n').slice(1).join('\n\n') : stripped;

    try {
        const rows = JSON.parse(jsonChunk);
        const payload = rows?.[0]?.[2];
        const decoded = typeof payload === 'string' ? JSON.parse(payload) : null;
        if (Array.isArray(decoded) && decoded[0] === 'garturlres' && typeof decoded[1] === 'string') {
            return decoded[1];
        }
    } catch {
        // Fall through to a loose regex for slightly different response envelopes.
    }

    const loose = body.match(/\[\s*"garturlres"\s*,\s*"(https?:\\\/\\\/[^"]+|https?:\/\/[^"]+)"/);
    if (!loose?.[1]) return null;
    return loose[1].replace(/\\u003d/g, '=').replace(/\\\//g, '/');
}

async function fetchGoogleNewsDecodeParams(articleId, { timeoutMs, userAgent, fetchImpl }) {
    for (const prefix of ['articles', 'rss/articles']) {
        try {
            const response = await fetchImpl(`https://${GOOGLE_NEWS_HOST}/${prefix}/${articleId}`, {
                headers: { 'User-Agent': userAgent, Accept: 'text/html' },
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) continue;

            const html = await response.text();
            const signature = firstMatch(html, /data-n-a-sg="([^"]+)"/);
            const timestamp = firstMatch(html, /data-n-a-ts="([^"]+)"/);
            if (signature && timestamp && /^\d+$/.test(timestamp)) {
                return { signature, timestamp };
            }
        } catch {
            // Try the next path prefix.
        }
    }
    return null;
}

/**
 * Best-effort Google News wrapper → publisher URL (no browser).
 * On any failure, returns the original URL unchanged.
 */
export async function resolveGoogleNewsPublisherUrl(url, {
    timeoutMs = 15_000,
    userAgent = DEFAULT_RESOLVE_USER_AGENT,
    fetchImpl = globalThis.fetch,
} = {}) {
    const articleId = googleNewsArticleId(url);
    if (!articleId) return url;

    try {
        const params = await fetchGoogleNewsDecodeParams(articleId, { timeoutMs, userAgent, fetchImpl });
        if (!params) return url;

        const requestBody = [
            'garturlreq',
            [
                ['en-US', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
                'en-US',
                'US',
                1,
                [1, 1, 1],
                1,
                1,
                null,
                0,
                0,
                null,
                0,
            ],
            articleId,
            Number(params.timestamp),
            params.signature,
        ];
        const fReq = JSON.stringify([[['Fbv4je', JSON.stringify(requestBody), null, 'generic']]]);

        const response = await fetchImpl(GOOGLE_NEWS_BATCHEXECUTE_URL, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: `f.req=${encodeURIComponent(fReq)}`,
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return url;

        const publisherUrl = parseBatchexecutePublisherUrl(await response.text());
        if (!publisherUrl || !isValidHttpUrl(publisherUrl) || isGoogleNewsArticleUrl(publisherUrl)) {
            return url;
        }

        return canonicalizeUrl(publisherUrl) || publisherUrl;
    } catch {
        return url;
    }
}

/**
 * Mutates articleLink on Google News items when the publisher URL can be resolved.
 * Leaves non-Google and failed items unchanged. Returns resolve counts.
 */
export async function resolvePublisherUrls(articles, {
    timeoutMs = 15_000,
    userAgent = DEFAULT_RESOLVE_USER_AGENT,
    concurrency = PUBLISHER_URL_RESOLVE_CONCURRENCY,
    fetchImpl = globalThis.fetch,
} = {}) {
    const targets = articles.filter((article) => isGoogleNewsArticleUrl(article?.articleLink));
    if (!targets.length) {
        return { attempted: 0, resolved: 0, failed: 0 };
    }

    let next = 0;
    let resolved = 0;
    let failed = 0;

    async function worker() {
        while (next < targets.length) {
            const article = targets[next];
            next += 1;
            const original = article.articleLink;
            const publisher = await resolveGoogleNewsPublisherUrl(original, { timeoutMs, userAgent, fetchImpl });
            if (publisher && publisher !== original) {
                article.articleLink = publisher;
                resolved += 1;
            } else {
                failed += 1;
            }
        }
    }

    const workers = Math.min(Math.max(1, concurrency), targets.length);
    await Promise.all(Array.from({ length: workers }, worker));

    return { attempted: targets.length, resolved, failed };
}

export function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesKeyword(text, keyword) {
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

export function containsAnyKeyword(text, keywords) {
    if (!keywords?.length) return true;
    return keywords.some((keyword) => matchesKeyword(text, keyword));
}

export function containsExcludedKeyword(text, keywords) {
    if (!keywords?.length) return false;
    return keywords.some((keyword) => matchesKeyword(text, keyword));
}

export function articleSearchText(headline, summary) {
    return `${headline} ${summary}`.trim();
}

export function detectTickers(text) {
    const found = new Set();
    const patterns = [
        /\$([A-Z]{1,5})\b/g,
        /\(([A-Z]{1,5})\)/g,
        /(?:NASDAQ|NYSE|AMEX|OTC):\s*([A-Z]{1,5})\b/g,
        /\b([A-Z]{2,5})\s+(?:stock|shares|equity|ticker)\b/g,
    ];

    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const symbol = (match[1] || '').toUpperCase();
            if (symbol && symbol.length >= 2 && !TICKER_FALSE_POSITIVES.has(symbol)) {
                found.add(symbol);
            }
        }
    }

    return [...found];
}

export function normalizeTicker(ticker) {
    return String(ticker ?? '').trim().replace(/^\$/, '').toUpperCase();
}

/**
 * Tickers are matched case-sensitively so short symbols (F, ON, IT, ALL)
 * don't match ordinary lowercase words. `knownTickers` are treated as matched,
 * e.g. when the article came from that ticker's own feed.
 */
export function matchesTickerFilter(searchable, tickers, matchMode, knownTickers = []) {
    if (!tickers?.length) return true;

    const detected = detectTickers(searchable);
    const known = new Set(knownTickers.map(normalizeTicker));
    const normalizedTickers = tickers.map(normalizeTicker).filter(Boolean);

    const matches = normalizedTickers.map((ticker) => {
        if (known.has(ticker) || detected.includes(ticker)) return true;
        return new RegExp(`(?<![A-Za-z0-9])${escapeRegex(ticker)}(?![A-Za-z0-9])`).test(searchable);
    });

    return matchMode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

export function buildTickerFeeds(tickers) {
    const feeds = [];
    const skipped = [];
    const seen = new Set();

    for (const raw of tickers) {
        const ticker = normalizeTicker(raw);
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);

        if (!TICKER_PATTERN.test(ticker)) {
            skipped.push({ ticker: String(raw), reason: 'invalid ticker symbol' });
            continue;
        }

        if (feeds.length >= MAX_TICKER_FEEDS) {
            skipped.push({ ticker, reason: `only the first ${MAX_TICKER_FEEDS} tickers get a dedicated feed` });
            continue;
        }

        feeds.push({
            name: 'Yahoo Finance',
            url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
            ticker,
        });
    }

    return { feeds, skipped };
}

export function buildGoogleNewsFeeds(queries, { language = 'en', country = 'US', hoursBack = 0 } = {}) {
    const feeds = [];
    const skipped = [];
    const lang = LANGUAGE_PATTERN.test(String(language).toLowerCase()) ? String(language).toLowerCase() : 'en';
    const gl = COUNTRY_PATTERN.test(String(country).toUpperCase()) ? String(country).toUpperCase() : 'US';
    const seen = new Set();

    for (const raw of queries) {
        const query = String(raw ?? '').trim();
        if (!query || seen.has(query.toLowerCase())) continue;
        seen.add(query.toLowerCase());

        if (feeds.length >= MAX_SEARCH_QUERIES) {
            skipped.push({ query, reason: `only the first ${MAX_SEARCH_QUERIES} search queries are used` });
            continue;
        }

        const withWindow = hoursBack > 0 && !/\bwhen:/i.test(query) ? `${query} when:${hoursBack}h` : query;
        const params = new URLSearchParams({ q: withWindow, hl: `${lang}-${gl}`, gl, ceid: `${gl}:${lang}` });
        feeds.push({
            name: 'Google News',
            url: `https://news.google.com/rss/search?${params}`,
            query,
        });
    }

    return { feeds, skipped };
}

export function stripPublisherSuffix(headline, publisher) {
    if (!headline || !publisher) return headline;
    const suffix = ` - ${publisher}`;
    return headline.endsWith(suffix) ? headline.slice(0, -suffix.length).trim() : headline;
}

/**
 * The default finance keywords apply only when the preset opts in and the user
 * set no tickers, companies, or search queries; an explicit array (including [])
 * is always respected.
 */
export function resolveIncludeKeywords({ includeKeywords, tickers, companies, searchQueries, useDefaultKeywords = true }) {
    if (Array.isArray(includeKeywords)) return { keywords: includeKeywords, warning: null };

    const hasTargetedInput = Boolean(tickers?.length || companies?.length || searchQueries?.length);
    const keywords = useDefaultKeywords && !hasTargetedInput ? DEFAULT_INCLUDE_KEYWORDS : [];

    if (includeKeywords != null) {
        return { keywords, warning: 'includeKeywords must be an array — ignoring it.' };
    }

    return { keywords, warning: null };
}

export function matchesCompanyFilter(searchable, companies) {
    if (!companies?.length) return true;
    const lower = searchable.toLowerCase();
    return companies.some((company) => lower.includes(String(company).toLowerCase()));
}

/** Fields required by the Actor dataset schema — always kept when projecting. */
export const DATASET_REQUIRED_FIELDS = Object.freeze(['headline', 'articleLink', 'source', 'fetchedAt']);

/** Restrict dataset rows to the requested fields. Empty/omitted fields = identity. */
export function projectOutputFields(articles, fields) {
    if (!Array.isArray(fields) || !fields.length) return articles;
    const keys = [...new Set([
        ...DATASET_REQUIRED_FIELDS,
        ...fields.map(String).filter(Boolean),
    ])];
    if (!keys.length) return articles;

    return articles.map((article) => {
        const row = {};
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(article, key)) row[key] = article[key];
        }
        return row;
    });
}

/**
 * Keep articles that match enrichment filters. Empty/omitted filters are no-ops.
 * Missing sentimentScore is treated as 0 when a sentiment bound is set.
 */
export function applyEnrichmentFilters(articles, {
    filterEventTypes = [],
    minSentimentScore = null,
    maxSentimentScore = null,
} = {}) {
    const eventTypes = Array.isArray(filterEventTypes) ? filterEventTypes.filter(Boolean) : [];
    const hasEventFilter = eventTypes.length > 0;
    const hasMin = minSentimentScore != null && Number.isFinite(Number(minSentimentScore));
    const hasMax = maxSentimentScore != null && Number.isFinite(Number(maxSentimentScore));
    if (!hasEventFilter && !hasMin && !hasMax) return articles;

    const min = hasMin ? Number(minSentimentScore) : null;
    const max = hasMax ? Number(maxSentimentScore) : null;

    return articles.filter((article) => {
        if (hasEventFilter) {
            const types = Array.isArray(article.eventTypes) ? article.eventTypes : [];
            if (!eventTypes.some((type) => types.includes(type))) return false;
        }

        if (hasMin || hasMax) {
            const score = Number.isFinite(article.sentimentScore) ? article.sentimentScore : 0;
            if (hasMin && score < min) return false;
            if (hasMax && score > max) return false;
        }

        return true;
    });
}

/** Normalize filterEventTypes to known ids; returns { types, unknown }. */
export function normalizeFilterEventTypes(raw, allowedIds) {
    const allowed = new Set(allowedIds);
    const types = [];
    const unknown = [];
    const seen = new Set();

    for (const value of Array.isArray(raw) ? raw : []) {
        const id = String(value || '').trim();
        if (!id) continue;
        if (!allowed.has(id)) {
            if (!unknown.includes(id)) unknown.push(id);
            continue;
        }
        if (!seen.has(id)) {
            seen.add(id);
            types.push(id);
        }
    }

    return { types, unknown };
}

export function enrichmentFiltersActive({ filterEventTypes, minSentimentScore, maxSentimentScore }) {
    const hasEvents = Array.isArray(filterEventTypes) && filterEventTypes.length > 0;
    const hasMin = minSentimentScore != null && Number.isFinite(Number(minSentimentScore));
    const hasMax = maxSentimentScore != null && Number.isFinite(Number(maxSentimentScore));
    return hasEvents || hasMin || hasMax;
}

export function resolveRunStatus({ feedsSucceeded, itemCount, failures, skippedAlreadySeen = 0 }) {
    if (feedsSucceeded === 0) return 'all_feeds_failed';
    if (itemCount === 0) return skippedAlreadySeen > 0 ? 'no_new_items' : 'no_items';
    if (failures.length > 0) return 'partial';
    return 'ok';
}

export function buildStatusMessage({ itemCount, feedsRequested, failures, runStatus, warnings, spendingLimitReached = false }) {
    const parts = [`Saved ${itemCount} news item(s).`];

    if (runStatus === 'all_feeds_failed') {
        parts.push(`All ${feedsRequested} feed(s) failed — see OUTPUT.failures.`);
    } else if (runStatus === 'no_items') {
        parts.push('No articles matched your filters.');
    } else if (runStatus === 'no_new_items') {
        parts.push('No new articles since the last run.');
    } else if (failures.length) {
        parts.push(`${failures.length}/${feedsRequested} feed failure(s).`);
    }

    if (spendingLimitReached) parts.push('Stopped at your maximum cost per run.');
    if (warnings.length && runStatus !== 'no_items' && runStatus !== 'all_feeds_failed') {
        parts.push(warnings[0]);
    }
    if (itemCount > 0) {
        parts.push('If this saved you time, a review helps other builders find it.');
    }

    return parts.join(' ');
}

export function normalizeFeedEntry(feed) {
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

export function validateCustomFeeds(rawFeeds) {
    const valid = [];
    const skipped = [];

    for (const feed of rawFeeds.slice(0, MAX_CUSTOM_FEEDS)) {
        const normalized = normalizeFeedEntry(feed);
        if (!normalized) {
            skipped.push({ feed, reason: 'invalid feed entry' });
            continue;
        }

        if (!isValidHttpUrl(normalized.url)) {
            skipped.push({ feed: normalized.url, reason: 'URL must use http or https' });
            continue;
        }

        valid.push(normalized);
    }

    if (rawFeeds.length > MAX_CUSTOM_FEEDS) {
        skipped.push({
            feed: null,
            reason: `Only the first ${MAX_CUSTOM_FEEDS} custom feeds are used`,
        });
    }

    return { valid, skipped };
}
