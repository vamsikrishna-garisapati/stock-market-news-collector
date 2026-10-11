import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStateKey, pruneSeen } from '../src/state.js';
import { extractReadableText, fullTextSkipReason } from '../src/fulltext.js';

const baseConfig = {
    feeds: [{ url: 'https://b.example/rss' }, { url: 'https://a.example/rss' }],
    tickers: ['AAPL'],
    companies: [],
    searchQueries: [],
    includeKeywords: [],
    excludeKeywords: [],
};

describe('deriveStateKey', () => {
    it('is stable regardless of feed order', () => {
        const reordered = { ...baseConfig, feeds: [...baseConfig.feeds].reverse() };
        assert.equal(deriveStateKey(baseConfig), deriveStateKey(reordered));
        assert.match(deriveStateKey(baseConfig), /^seen-[0-9a-f]{16}$/);
    });

    it('differs for different watchlists', () => {
        assert.notEqual(deriveStateKey(baseConfig), deriveStateKey({ ...baseConfig, tickers: ['TSLA'] }));
    });

    it('uses and sanitizes a user-supplied key', () => {
        assert.equal(deriveStateKey({ ...baseConfig, stateKey: 'my watchlist/1' }), 'seen-my-watchlist-1');
    });
});

describe('pruneSeen', () => {
    it('drops entries older than the retention window', () => {
        const now = Date.parse('2026-10-11T00:00:00Z');
        const day = 24 * 60 * 60 * 1000;
        const pruned = pruneSeen({ fresh: now - day, old: now - 30 * day }, now);
        assert.deepEqual(Object.keys(pruned), ['fresh']);
    });
});

describe('fullTextSkipReason', () => {
    it('skips paywalled and Google News links', () => {
        assert.equal(fullTextSkipReason('https://www.bloomberg.com/news/articles/x'), 'paywalled');
        assert.equal(fullTextSkipReason('https://news.google.com/rss/articles/abc'), 'unsupported');
        assert.equal(fullTextSkipReason('https://www.cnbc.com/2026/10/10/story.html'), null);
    });
});

describe('extractReadableText', () => {
    it('extracts the article body and drops navigation', () => {
        const paragraph = 'Nvidia shares rose after the company reported record data center revenue. '.repeat(6);
        const html = `<html><head><title>Story</title></head><body>
            <nav><a href="/">Home</a><a href="/markets">Markets</a></nav>
            <article><h1>Nvidia rallies</h1><p>${paragraph}</p><p>${paragraph}</p></article>
            <footer>Copyright</footer></body></html>`;
        const text = extractReadableText(html);
        assert.ok(text.includes('record data center revenue'));
        assert.ok(!text.includes('Copyright'));
    });

    it('returns null for pages without real content', () => {
        assert.equal(extractReadableText('<html><body><p>Subscribe now</p></body></html>'), null);
    });
});
