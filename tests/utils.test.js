import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_INCLUDE_KEYWORDS,
    MAX_SEARCH_QUERIES,
    MAX_TICKER_FEEDS,
    buildGoogleNewsFeeds,
    buildStatusMessage,
    buildTickerFeeds,
    canonicalizeUrl,
    cleanText,
    detectTickers,
    isValidHttpUrl,
    matchesKeyword,
    matchesTickerFilter,
    resolveIncludeKeywords,
    resolveRunStatus,
    stripPublisherSuffix,
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

    it('removes the Yahoo .tsrc tracking parameter', () => {
        const url = 'https://finance.yahoo.com/news/apple-deal-195000172.html?.tsrc=rss';
        assert.equal(canonicalizeUrl(url), 'https://finance.yahoo.com/news/apple-deal-195000172.html');
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

    it('does not match short tickers against lowercase words', () => {
        assert.equal(matchesTickerFilter('Stocks fall on all fronts as rates rise', ['ON', 'ALL'], 'any'), false);
        assert.equal(matchesTickerFilter('Ford (F) and ON Semiconductor rally', ['F', 'ON'], 'all'), true);
    });

    it('treats known tickers from a ticker feed as matched', () => {
        assert.equal(matchesTickerFilter('Apple hires podcast startup team', ['AAPL'], 'any', ['AAPL']), true);
        assert.equal(matchesTickerFilter('Apple hires podcast startup team', ['AAPL', 'TSLA'], 'all', ['AAPL']), false);
    });

    it('normalizes lowercase and dollar-prefixed input tickers', () => {
        assert.equal(matchesTickerFilter('NVDA jumps after earnings', ['$nvda'], 'any'), true);
    });
});

describe('buildTickerFeeds', () => {
    it('builds one Yahoo feed per unique ticker', () => {
        const { feeds, skipped } = buildTickerFeeds(['aapl', '$AAPL', 'BRK-B']);
        assert.deepEqual(feeds.map((f) => f.ticker), ['AAPL', 'BRK-B']);
        assert.match(feeds[1].url, /headline\?s=BRK-B&region=US/);
        assert.equal(skipped.length, 0);
    });

    it('skips invalid symbols and caps the feed count', () => {
        const many = Array.from({ length: MAX_TICKER_FEEDS + 2 }, (_, i) => `T${i}`);
        const { feeds, skipped } = buildTickerFeeds(['bad ticker', ...many]);
        assert.equal(feeds.length, MAX_TICKER_FEEDS);
        assert.equal(skipped.length, 3);
    });
});

describe('resolveIncludeKeywords', () => {
    it('uses default keywords when nothing is set', () => {
        assert.deepEqual(resolveIncludeKeywords({}).keywords, DEFAULT_INCLUDE_KEYWORDS);
    });

    it('drops default keywords when tickers, companies, or search queries are set', () => {
        assert.deepEqual(resolveIncludeKeywords({ tickers: ['AAPL'] }).keywords, []);
        assert.deepEqual(resolveIncludeKeywords({ companies: ['Apple'] }).keywords, []);
        assert.deepEqual(resolveIncludeKeywords({ searchQueries: ['Infosys'] }).keywords, []);
    });

    it('drops default keywords for presets that opt out', () => {
        assert.deepEqual(resolveIncludeKeywords({ useDefaultKeywords: false }).keywords, []);
    });

    it('respects an explicit list, including an empty one', () => {
        assert.deepEqual(resolveIncludeKeywords({ includeKeywords: ['ipo'], tickers: ['AAPL'] }).keywords, ['ipo']);
        assert.deepEqual(resolveIncludeKeywords({ includeKeywords: [] }).keywords, []);
    });

    it('warns on non-array input', () => {
        const { keywords, warning } = resolveIncludeKeywords({ includeKeywords: 'stock' });
        assert.deepEqual(keywords, DEFAULT_INCLUDE_KEYWORDS);
        assert.ok(warning);
    });
});

describe('buildGoogleNewsFeeds', () => {
    it('builds a localized search URL with a time window', () => {
        const { feeds } = buildGoogleNewsFeeds(['Reliance Industries'], { language: 'en', country: 'in', hoursBack: 24 });
        const url = new URL(feeds[0].url);
        assert.equal(url.searchParams.get('q'), 'Reliance Industries when:24h');
        assert.equal(url.searchParams.get('hl'), 'en-IN');
        assert.equal(url.searchParams.get('gl'), 'IN');
        assert.equal(url.searchParams.get('ceid'), 'IN:en');
        assert.equal(feeds[0].query, 'Reliance Industries');
    });

    it('keeps a user-supplied when: operator and falls back on invalid locale', () => {
        const { feeds } = buildGoogleNewsFeeds(['nvidia when:7d'], { language: 'english', country: 'USA', hoursBack: 24 });
        const url = new URL(feeds[0].url);
        assert.equal(url.searchParams.get('q'), 'nvidia when:7d');
        assert.equal(url.searchParams.get('hl'), 'en-US');
    });

    it('dedupes queries and caps the count', () => {
        const queries = ['a', 'A', ...Array.from({ length: MAX_SEARCH_QUERIES + 1 }, (_, i) => `q${i}`)];
        const { feeds, skipped } = buildGoogleNewsFeeds(queries);
        assert.equal(feeds.length, MAX_SEARCH_QUERIES);
        assert.equal(skipped.length, 2);
    });
});

describe('stripPublisherSuffix', () => {
    it('removes the trailing publisher name Google News appends', () => {
        assert.equal(stripPublisherSuffix('Infosys rallies 3% - NDTV', 'NDTV'), 'Infosys rallies 3%');
        assert.equal(stripPublisherSuffix('Infosys rallies 3%', 'NDTV'), 'Infosys rallies 3%');
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

    it('returns no_new_items when everything was already seen', () => {
        assert.equal(resolveRunStatus({
            feedsSucceeded: 3,
            itemCount: 0,
            failures: [],
            skippedAlreadySeen: 12,
        }), 'no_new_items');
    });
});

describe('buildStatusMessage', () => {
    it('mentions the spending limit when output was cut', () => {
        const msg = buildStatusMessage({
            itemCount: 10,
            feedsRequested: 4,
            failures: [],
            runStatus: 'ok',
            warnings: [],
            spendingLimitReached: true,
        });
        assert.match(msg, /Saved 10 news item\(s\)\. Stopped at your maximum cost per run\./);
    });

    it('explains a run with no new articles', () => {
        const msg = buildStatusMessage({ itemCount: 0, feedsRequested: 4, failures: [], runStatus: 'no_new_items', warnings: [] });
        assert.match(msg, /No new articles since the last run/);
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
