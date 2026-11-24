import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    googleNewsArticleId,
    isGoogleNewsArticleUrl,
    resolveGoogleNewsPublisherUrl,
    resolvePublisherUrls,
} from '../src/utils.js';

const GNEWS_ID = 'CBMic0FVX3lxTE9NTEZ0VXRCRUloZzVGUzFFb1RhMXNOclJ4TmtQS09uSTYwX1NYc18yT3Z2TW5Pb0ItV0VlVVk3RUxIdklRdGIzUGFjNzlDVXF3c3FWS0locC1VU0dUTjdMU2QxQTRiOGpLSFk4RmxBUWxfZ2M';
const GNEWS_URL = `https://news.google.com/rss/articles/${GNEWS_ID}?oc=5`;
const PUBLISHER_URL = 'https://mashable.com/tech/best-black-friday-apple-live-deals-2026';

describe('isGoogleNewsArticleUrl / googleNewsArticleId', () => {
    it('detects RSS and articles wrapper URLs', () => {
        assert.equal(isGoogleNewsArticleUrl(GNEWS_URL), true);
        assert.equal(isGoogleNewsArticleUrl(`https://news.google.com/articles/${GNEWS_ID}`), true);
        assert.equal(isGoogleNewsArticleUrl(`https://news.google.com/read/${GNEWS_ID}`), true);
        assert.equal(googleNewsArticleId(GNEWS_URL), GNEWS_ID);
    });

    it('rejects publisher and search URLs', () => {
        assert.equal(isGoogleNewsArticleUrl(PUBLISHER_URL), false);
        assert.equal(isGoogleNewsArticleUrl('https://news.google.com/rss/search?q=Apple'), false);
        assert.equal(googleNewsArticleId(PUBLISHER_URL), null);
    });
});

describe('resolveGoogleNewsPublisherUrl', () => {
    it('returns non-Google URLs unchanged without fetching', async () => {
        let calls = 0;
        const fetchImpl = async () => {
            calls += 1;
            throw new Error('should not fetch');
        };
        assert.equal(
            await resolveGoogleNewsPublisherUrl(PUBLISHER_URL, { fetchImpl }),
            PUBLISHER_URL,
        );
        assert.equal(calls, 0);
    });

    it('resolves via signature page + batchexecute', async () => {
        const fetchImpl = async (url, init = {}) => {
            if (String(url).includes('/_/DotsSplashUi/data/batchexecute')) {
                assert.equal(init.method, 'POST');
                return {
                    ok: true,
                    text: async () => `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', PUBLISHER_URL, 1]), null, null, null, 'generic']])}`,
                };
            }
            return {
                ok: true,
                text: async () => '<html><body data-n-a-sg="sig123" data-n-a-ts="1795544266"></body></html>',
            };
        };

        assert.equal(
            await resolveGoogleNewsPublisherUrl(GNEWS_URL, { fetchImpl, timeoutMs: 5_000 }),
            PUBLISHER_URL,
        );
    });

    it('keeps the redirect when signature params are missing', async () => {
        const fetchImpl = async () => ({
            ok: true,
            text: async () => '<html><body>no params</body></html>',
        });
        assert.equal(
            await resolveGoogleNewsPublisherUrl(GNEWS_URL, { fetchImpl }),
            GNEWS_URL,
        );
    });

    it('keeps the redirect when fetch throws', async () => {
        const fetchImpl = async () => {
            throw new Error('network down');
        };
        assert.equal(
            await resolveGoogleNewsPublisherUrl(GNEWS_URL, { fetchImpl }),
            GNEWS_URL,
        );
    });
});

describe('resolvePublisherUrls', () => {
    it('mutates only Google News articleLink values and reports counts', async () => {
        const articles = [
            { articleLink: GNEWS_URL, headline: 'A' },
            { articleLink: 'https://www.cnbc.com/story.html', headline: 'B' },
            { articleLink: `https://news.google.com/articles/${GNEWS_ID}`, headline: 'C' },
        ];

        let postCount = 0;
        const fetchImpl = async (url, init = {}) => {
            if (String(url).includes('batchexecute')) {
                postCount += 1;
                // Fail the second resolve to exercise fallback.
                if (postCount === 2) {
                    return { ok: false, text: async () => '' };
                }
                return {
                    ok: true,
                    text: async () => `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', PUBLISHER_URL, 1])]])}`,
                };
            }
            return {
                ok: true,
                text: async () => '<div data-n-a-sg="abc" data-n-a-ts="123"></div>',
            };
        };

        const stats = await resolvePublisherUrls(articles, { fetchImpl, concurrency: 1 });
        assert.deepEqual(stats, { attempted: 2, resolved: 1, failed: 1 });
        assert.equal(articles[0].articleLink, PUBLISHER_URL);
        assert.equal(articles[1].articleLink, 'https://www.cnbc.com/story.html');
        assert.equal(articles[2].articleLink, `https://news.google.com/articles/${GNEWS_ID}`);
    });

    it('no-ops when there are no Google News links', async () => {
        const articles = [{ articleLink: 'https://www.cnbc.com/a' }];
        const stats = await resolvePublisherUrls(articles, {
            fetchImpl: async () => {
                throw new Error('should not fetch');
            },
        });
        assert.deepEqual(stats, { attempted: 0, resolved: 0, failed: 0 });
    });
});
