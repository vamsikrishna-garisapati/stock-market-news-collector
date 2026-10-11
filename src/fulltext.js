import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { USER_AGENT } from './feeds.js';

const PAYWALLED_HOSTS = ['bloomberg.com', 'wsj.com', 'ft.com', 'barrons.com', 'economist.com'];
const UNSUPPORTED_HOSTS = ['news.google.com'];
const MAX_HTML_BYTES = 3_000_000;
const MIN_TEXT_LENGTH = 200;
const CONCURRENCY = 5;

function hostMatches(hostname, hosts) {
    return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function fullTextSkipReason(url) {
    let hostname;
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch {
        return 'unsupported';
    }
    if (hostMatches(hostname, UNSUPPORTED_HOSTS)) return 'unsupported';
    if (hostMatches(hostname, PAYWALLED_HOSTS)) return 'paywalled';
    return null;
}

export function extractReadableText(html) {
    const { document } = parseHTML(html);
    const article = new Readability(document, { charThreshold: MIN_TEXT_LENGTH }).parse();
    const text = (article?.textContent || '')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n{2,}/g, '\n\n')
        .trim();
    return text.length >= MIN_TEXT_LENGTH ? text : null;
}

async function fetchOne(url, { timeoutMs, maxChars }) {
    const skipReason = fullTextSkipReason(url);
    if (skipReason) return { fullText: null, fullTextStatus: skipReason };

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
            redirect: 'follow',
            signal: AbortSignal.timeout(timeoutMs),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok) return { fullText: null, fullTextStatus: 'failed', fullTextError: `HTTP ${response.status}` };
        if (!contentType.includes('html')) return { fullText: null, fullTextStatus: 'unsupported' };

        const html = await response.text();
        if (html.length > MAX_HTML_BYTES) return { fullText: null, fullTextStatus: 'failed', fullTextError: 'page too large' };

        const text = extractReadableText(html);
        if (!text) return { fullText: null, fullTextStatus: 'empty' };

        return {
            fullText: text.length > maxChars ? `${text.slice(0, maxChars - 1).trim()}…` : text,
            fullTextStatus: 'ok',
        };
    } catch (error) {
        return { fullText: null, fullTextStatus: 'failed', fullTextError: error.name === 'TimeoutError' ? 'timeout' : error.message };
    }
}

/** Mutates each article in place, adding fullText and fullTextStatus. */
export async function addFullText(articles, { timeoutMs = 15_000, maxChars = 10_000 } = {}) {
    let next = 0;

    async function worker() {
        while (next < articles.length) {
            const article = articles[next];
            next += 1;
            Object.assign(article, await fetchOne(article.articleLink, { timeoutMs, maxChars }));
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, articles.length) }, worker));

    return articles.reduce((counts, article) => {
        counts[article.fullTextStatus] = (counts[article.fullTextStatus] || 0) + 1;
        return counts;
    }, {});
}
