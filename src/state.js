import { createHash } from 'node:crypto';
import { Actor } from 'apify';

export const STATE_STORE_NAME = 'stock-market-news-state';
const SEEN_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SEEN_KEYS = 20_000;

/**
 * Runs with the same sources and filters share one history, so separate
 * scheduled tasks (e.g. different watchlists) don't hide each other's articles.
 */
export function deriveStateKey({ stateKey, feeds, tickers, companies, searchQueries, includeKeywords, excludeKeywords }) {
    if (stateKey) {
        const safe = String(stateKey).replace(/[^a-zA-Z0-9!\-_.'()]/g, '-').slice(0, 200);
        if (safe) return `seen-${safe}`;
    }

    const fingerprint = JSON.stringify({
        feeds: feeds.map((feed) => feed.url).sort(),
        tickers: [...tickers].map(String).sort(),
        companies: [...companies].map(String).sort(),
        searchQueries: [...searchQueries].map(String).sort(),
        includeKeywords: [...includeKeywords].map(String).sort(),
        excludeKeywords: [...excludeKeywords].map(String).sort(),
    });

    return `seen-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)}`;
}

export function pruneSeen(seen, now = Date.now()) {
    const fresh = Object.entries(seen)
        .filter(([, seenAt]) => now - seenAt < SEEN_RETENTION_MS)
        .sort(([, a], [, b]) => b - a)
        .slice(0, MAX_SEEN_KEYS);
    return Object.fromEntries(fresh);
}

export async function loadSeenArticles(key) {
    const store = await Actor.openKeyValueStore(STATE_STORE_NAME);
    const record = await store.getValue(key);
    const seen = record && typeof record.seen === 'object' ? record.seen : {};
    return { store, seen };
}

export async function saveSeenArticles(store, key, seen, newKeys, now = Date.now()) {
    const updated = { ...seen };
    for (const dedupeKey of newKeys) updated[dedupeKey] = now;
    await store.setValue(key, { updatedAt: new Date(now).toISOString(), seen: pruneSeen(updated, now) });
}
