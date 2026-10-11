import { BUILT_IN_FEEDS, createParser } from '../src/feeds.js';
import { buildGoogleNewsFeeds, buildTickerFeeds } from '../src/utils.js';

const MAX_AGE_HOURS = Number(process.env.FEED_MAX_AGE_HOURS || 96);

const feeds = [
    ...BUILT_IN_FEEDS,
    ...buildTickerFeeds(['AAPL']).feeds,
    ...buildGoogleNewsFeeds(['stock market'], { hoursBack: 24 }).feeds,
];

const parser = createParser(20_000);

const results = await Promise.all(feeds.map(async (feed) => {
    const label = feed.ticker ? `${feed.name} (${feed.ticker})` : feed.query ? `${feed.name}: ${feed.query}` : feed.name;
    try {
        const parsed = await parser.parseURL(feed.url);
        const newest = Math.max(0, ...parsed.items.map((item) => Date.parse(item.isoDate || item.pubDate) || 0));
        const ageHours = newest ? (Date.now() - newest) / 3_600_000 : null;

        let problem = null;
        if (!parsed.items.length) problem = 'no items';
        else if (ageHours === null) problem = 'no publish dates';
        else if (ageHours > MAX_AGE_HOURS) problem = `stale: newest item ${ageHours.toFixed(0)}h old`;

        return { label, url: feed.url, items: parsed.items.length, ageHours, problem };
    } catch (error) {
        return { label, url: feed.url, items: 0, ageHours: null, problem: error.message };
    }
}));

for (const result of results) {
    const age = result.ageHours === null ? '-' : `${result.ageHours.toFixed(1)}h`;
    const status = result.problem ? `FAIL  ${result.problem}` : 'OK';
    console.log(`${status.padEnd(40)} ${String(result.items).padStart(3)} items  newest ${age.padStart(7)}  ${result.label}`);
}

const failed = results.filter((result) => result.problem);
if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} feed(s) unhealthy:`);
    for (const result of failed) console.error(`- ${result.label}: ${result.problem} (${result.url})`);
    process.exit(1);
}

console.log(`\nAll ${results.length} feeds healthy.`);
process.exit(0);
