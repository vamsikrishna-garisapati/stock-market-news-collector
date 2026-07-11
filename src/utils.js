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

export const FREE_TIER_MAX_ITEMS = 25;
export const MAX_CUSTOM_FEEDS = 20;
export const MAX_HEADLINE_LENGTH = 500;

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
            if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) {
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

export function matchesTickerFilter(searchable, tickers, matchMode) {
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

export function matchesCompanyFilter(searchable, companies) {
    if (!companies?.length) return true;
    const lower = searchable.toLowerCase();
    return companies.some((company) => lower.includes(String(company).toLowerCase()));
}

export function resolveRunStatus({ feedsSucceeded, itemCount, failures }) {
    if (feedsSucceeded === 0) return 'all_feeds_failed';
    if (itemCount === 0) return 'no_items';
    if (failures.length > 0) return 'partial';
    return 'ok';
}

export function buildStatusMessage({ output, feedsRequested, failures, freeTier, runStatus, warnings }) {
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
