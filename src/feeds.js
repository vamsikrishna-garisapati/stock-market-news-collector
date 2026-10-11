import Parser from 'rss-parser';

export const USER_AGENT = 'Mozilla/5.0 (compatible; ApifyStockMarketNewsActor/1.0; +https://apify.com/)';

export const FEEDS = {
    marketWatchTopStories: { name: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
    marketWatchBulletins: { name: 'MarketWatch Breaking News', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins' },
    bloombergMarkets: { name: 'Bloomberg Markets', url: 'https://www.bloomberg.com/feeds/markets/news.rss' },
    cnbcInvesting: { name: 'CNBC Investing', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html' },
    cnbcEarnings: { name: 'CNBC Earnings', url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html' },
    cnbcInternational: { name: 'CNBC International', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
    economicTimesMarkets: { name: 'Economic Times Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
    economicTimesStocks: { name: 'Economic Times Stocks', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
    livemintMarkets: { name: 'Mint Markets', url: 'https://www.livemint.com/rss/markets' },
    coinDesk: { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    cointelegraph: { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
    decrypt: { name: 'Decrypt', url: 'https://decrypt.co/feed' },
    theBlock: { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
};

export const DEFAULT_PRESET = 'us_markets';

/**
 * `useDefaultKeywords` controls whether the built-in finance keyword list is
 * applied when the user leaves includeKeywords unset. Topical presets (India,
 * crypto) skip it because their feeds are already on-topic.
 */
export const FEED_PRESETS = {
    us_markets: {
        feeds: [FEEDS.marketWatchTopStories, FEEDS.marketWatchBulletins, FEEDS.cnbcInvesting, FEEDS.bloombergMarkets],
        useDefaultKeywords: true,
    },
    global_markets: {
        feeds: [FEEDS.bloombergMarkets, FEEDS.cnbcInternational, FEEDS.marketWatchTopStories],
        useDefaultKeywords: true,
    },
    earnings: {
        feeds: [FEEDS.cnbcEarnings, FEEDS.cnbcInvesting, FEEDS.bloombergMarkets],
        useDefaultKeywords: true,
    },
    india_markets: {
        feeds: [FEEDS.economicTimesMarkets, FEEDS.economicTimesStocks, FEEDS.livemintMarkets],
        useDefaultKeywords: false,
    },
    crypto: {
        feeds: [FEEDS.coinDesk, FEEDS.cointelegraph, FEEDS.decrypt, FEEDS.theBlock],
        useDefaultKeywords: false,
    },
    none: {
        feeds: [],
        useDefaultKeywords: false,
    },
};

export const BUILT_IN_FEEDS = Object.values(FEEDS);

export function createParser(timeoutMs) {
    return new Parser({
        timeout: timeoutMs,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        customFields: {
            item: [
                ['content:encoded', 'contentEncoded'],
                ['dc:creator', 'dcCreator'],
                ['media:content', 'mediaContent'],
                'source',
            ],
        },
    });
}
