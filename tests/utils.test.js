import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildStatusMessage,
    canonicalizeUrl,
    cleanText,
    detectTickers,
    isValidHttpUrl,
    matchesKeyword,
    matchesTickerFilter,
    resolveRunStatus,
    validateCustomFeeds,
} from '../src/utils.js';

describe('cleanText', () => {
    it('strips HTML and decodes entities', () => {
        assert.equal(cleanText('<p>Apple &amp; Co</p>'), 'Apple & Co');
    });

    it('collapses whitespace', () => {
        assert.equal(cleanText('  hello   world  '), 'hello world');
    });
});

describe('canonicalizeUrl', () => {
    it('removes UTM parameters', () => {
        const url = 'https://example.com/article?utm_source=twitter&id=1';
        assert.equal(canonicalizeUrl(url), 'https://example.com/article?id=1');
    });

    it('rejects non-http schemes', () => {
        assert.equal(canonicalizeUrl('javascript:alert(1)'), null);
        assert.equal(canonicalizeUrl('ftp://example.com/rss'), null);
    });

    it('returns null for invalid URLs', () => {
        assert.equal(canonicalizeUrl('not-a-url'), null);
    });
});

describe('isValidHttpUrl', () => {
    it('accepts http and https', () => {
        assert.equal(isValidHttpUrl('https://example.com/rss'), true);
        assert.equal(isValidHttpUrl('http://example.com/rss'), true);
    });

    it('rejects other schemes', () => {
        assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
        assert.equal(isValidHttpUrl('file:///etc/passwd'), false);
    });
});

describe('matchesKeyword', () => {
    it('matches whole words for short keywords', () => {
        assert.equal(matchesKeyword('Dow Jones hits record', 'dow'), true);
        assert.equal(matchesKeyword('Download report today', 'dow'), false);
    });

    it('matches multi-word phrases', () => {
        assert.equal(matchesKeyword('S&P 500 hits record', 's&p'), true);
    });
});

describe('detectTickers', () => {
    it('detects dollar-prefixed tickers', () => {
        assert.deepEqual(detectTickers('Shares of $AAPL rose today'), ['AAPL']);
    });

    it('detects exchange-prefixed tickers', () => {
        assert.deepEqual(detectTickers('NASDAQ: NVDA gains on AI news'), ['NVDA']);
    });

    it('filters false positives', () => {
        assert.deepEqual(detectTickers('THE market is UP today'), []);
    });
});

describe('matchesTickerFilter', () => {
    it('matches any ticker by default', () => {
        assert.equal(matchesTickerFilter('Apple $AAPL news', ['AAPL', 'TSLA'], 'any'), true);
        assert.equal(matchesTickerFilter('Tesla stock rises', ['AAPL'], 'any'), false);
    });

    it('requires all tickers in all mode', () => {
        const text = 'Apple and Tesla: $AAPL and $TSLA';
        assert.equal(matchesTickerFilter(text, ['AAPL', 'TSLA'], 'all'), true);
        assert.equal(matchesTickerFilter('Apple $AAPL only', ['AAPL', 'TSLA'], 'all'), false);
    });

    it('passes when no tickers configured', () => {
        assert.equal(matchesTickerFilter('any text', [], 'any'), true);
    });
});

describe('resolveRunStatus', () => {
    it('returns all_feeds_failed when nothing succeeded', () => {
        assert.equal(resolveRunStatus({
            feedsSucceeded: 0,
            itemCount: 0,
            failures: [{ error: 'timeout' }],
        }), 'all_feeds_failed');
    });

    it('returns no_items when feeds ok but empty output', () => {
        assert.equal(resolveRunStatus({
            feedsSucceeded: 2,
            itemCount: 0,
            failures: [],
        }), 'no_items');
    });

    it('returns partial when some feeds failed', () => {
        assert.equal(resolveRunStatus({
            feedsSucceeded: 2,
            itemCount: 5,
            failures: [{ error: 'timeout' }],
        }), 'partial');
    });

    it('returns ok when all feeds succeed with items', () => {
        assert.equal(resolveRunStatus({
            feedsSucceeded: 3,
            itemCount: 10,
            failures: [],
        }), 'ok');
    });
});

describe('buildStatusMessage', () => {
    it('includes free tier note', () => {
        const msg = buildStatusMessage({
            output: [{ headline: 'x' }],
            feedsRequested: 4,
            failures: [],
            freeTier: true,
            runStatus: 'ok',
            warnings: [],
        });
        assert.match(msg, /Free tier: max 25 items/);
    });
});

describe('validateCustomFeeds', () => {
    it('accepts valid http feeds', () => {
        const { valid, skipped } = validateCustomFeeds([
            { name: 'Test', url: 'https://example.com/rss.xml' },
        ]);
        assert.equal(valid.length, 1);
        assert.equal(skipped.length, 0);
    });

    it('skips invalid URLs', () => {
        const { valid, skipped } = validateCustomFeeds([
            'javascript:alert(1)',
            { url: 'not-a-url' },
        ]);
        assert.equal(valid.length, 0);
        assert.equal(skipped.length, 2);
    });

    it('caps feed count at MAX_CUSTOM_FEEDS', () => {
        const feeds = Array.from({ length: 25 }, (_, i) => `https://example.com/feed-${i}.xml`);
        const { valid, skipped } = validateCustomFeeds(feeds);
        assert.equal(valid.length, 20);
        assert.ok(skipped.some((s) => s.reason.includes('20')));
    });
});
