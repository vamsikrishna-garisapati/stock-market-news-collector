import striptags from 'striptags';
import { decode } from 'html-entities';

export const DEFAULT_INCLUDE_KEYWORDS = [
    'stock', 'stocks', 'market', 'markets', 'equity', 'equities', 'shares',
    's&p', 'dow', 'nasdaq', 'earnings', 'ipo', 'nifty', 'sensex',
];

export const TICKER_FALSE_POSITIVES = new Set([
    'A', 'AI', 'AM', 'AN', 'API', 'ARE', 'AS', 'AT', 'BE', 'BIG', 'CAN', 'CEO', 'CO',
    'DAY', 'DO', 'ETF', 'EU', 'FDA', 'FOR', 'GDP', 'GO', 'HAS', 'HE', 'HER', 'HIS',
    'IF', 'IN', 'IPO', 'IS', 'IT', 'ITS', 'LOW', 'NEW', 'NO', 'NOT', 'OF', 'ON',
    'OR', 'OUR', 'OUT', 'PM', 'SO', 'THE', 'TO', 'UK', 'UP', 'US', 'USD', 'VS', 'WE',
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
