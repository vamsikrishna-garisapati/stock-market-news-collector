## US Stock Market News Scraper | Ticker Filter | Bloomberg, Yahoo Finance

Collect the **latest US stock market news** from Bloomberg, MarketWatch, and Yahoo Finance in clean JSON. Filter by **stock ticker**, company name, or keyword. No login, no API keys — built for trading dashboards, portfolio alerts, sentiment pipelines, and AI/RAG datasets.

Runs in seconds over public RSS feeds. Returns headlines, summaries, publication dates, auto-detected tickers, and article links — ready to download or consume via the Apify API.

Built-in presets focus on **US markets**. For other regions, set `feedPreset` to `custom` and add your own RSS feed URLs.

## For AI agents

This Actor is designed for MCP and API discovery:

- **Search terms:** stock market news, financial news RSS, Bloomberg news, ticker news, Yahoo Finance headlines
- **Actor name:** `stock-market-news-collector`
- **Primary output:** dataset items (`headline`, `articleLink`, `tickers`, `publishedDate`)
- **Run outcome:** always succeeds — check `OUTPUT.runStatus` when `count` is 0
- **Agent guide:** see [AGENTS.md](./AGENTS.md) for input recipes, output fields, and common mistakes

Apify MCP `fetch-actor-details` returns input schema, output schema, dataset field examples, and this README.

## What you get

Each article in the dataset:

```json
{
  "headline": "US Stocks Rise as Indexes on Track for Best Quarter Since 2020",
  "source": "Bloomberg Markets",
  "author": null,
  "publishedDate": "2026-06-30T17:00:00.000Z",
  "articleLink": "https://www.bloomberg.com/news/articles/...",
  "summary": "US equities climbed as investors weighed...",
  "categories": ["Markets"],
  "imageUrl": "https://...",
  "tickers": ["AAPL"],
  "dedupeKey": "https://www.bloomberg.com/news/articles/...",
  "sourceFeed": "https://feeds.bloomberg.com/markets/news.rss",
  "fetchedAt": "2026-06-30T17:14:35.211Z"
}
```

Each run also produces a **run summary** in the Output tab (feed stats, failures, and `runStatus`: `ok`, `partial`, `no_items`, `all_feeds_failed`, or `error`).

## Use cases

- **Portfolio watchlist alerts** — filter by tickers like `AAPL`, `TSLA`, or `NVDA`
- **Trading dashboards** — feed headlines into your app via the Apify API
- **Sentiment and NLP pipelines** — headlines and summaries for classification or entity extraction
- **AI and RAG datasets** — structured financial news JSON for retrieval or fine-tuning
- **Market research** — multi-source news with deduplication and date filters

## How to use this stock market news scraper

1. Open the Actor on Apify and choose a **Feed preset** (US markets is the default).
2. Optionally set **Stock tickers**, **Company names**, or adjust **Include keywords**.
3. Click **Start** — results appear in the Output tab within seconds.
4. Download as JSON, CSV, or Excel, or integrate via the [Apify API](https://docs.apify.com/api/v2).

### Watchlist example

Articles must match **both** your tickers and the default finance keyword filter. To skip keyword filtering, set `includeKeywords` to `[]`.

```json
{
  "feedPreset": "us_markets",
  "tickers": ["AAPL", "TSLA"],
  "tickerMatchMode": "any",
  "maxItems": 50,
  "hoursBack": 24
}
```

### All articles from feeds (no keyword filter)

```json
{
  "feedPreset": "us_markets",
  "includeKeywords": [],
  "maxItems": 50,
  "hoursBack": 24
}
```

### Custom RSS feeds

```json
{
  "feedPreset": "custom",
  "feeds": [
    { "name": "My feed", "url": "https://example.com/rss.xml" }
  ],
  "includeKeywords": [],
  "maxItems": 50
}
```

### Apify API (Node.js)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_APIFY_TOKEN' });
const run = await client.actor('YOUR_USERNAME/stock-market-news-collector').call({
    tickers: ['AAPL', 'NVDA'],
    maxItems: 25,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

## Feed presets

| Preset | Sources | Best for |
| --- | --- | --- |
| `us_markets` (default) | MarketWatch Top Stories, MarketWatch Market Pulse, Yahoo Finance, Bloomberg | US equities and market headlines |
| `global_markets` | Bloomberg, Yahoo Finance, MarketWatch Top Stories | Broader coverage (US-English sources) |
| `earnings` | MarketWatch Market Pulse, Yahoo Finance, Bloomberg | Earnings and corporate news |
| `custom` | Your own RSS URLs | Any region or publisher |

## Input parameters

| Field | Default | Description |
| --- | --- | --- |
| `feedPreset` | `us_markets` | Feed bundle or `custom` |
| `feeds` | `[]` | RSS URLs when preset is `custom` |
| `tickers` | `[]` | Filter by symbols; leave empty to disable |
| `companies` | `[]` | Filter by company name in headline/summary |
| `tickerMatchMode` | `any` | `any` or `all` tickers must match |
| `includeKeywords` | Finance terms | Match headline + summary; set `[]` to disable |
| `excludeKeywords` | `[]` | Exclude matching articles |
| `maxItems` | `50` | Max articles returned (25 on free Apify plan) |
| `hoursBack` | `24` | Only articles from the last N hours (`0` = no date filter) |
| `deduplicate` | `true` | Remove cross-feed duplicates by article URL |

Advanced: `maxItemsPerFeed`, `requestTimeoutMs` (default 15000), `feedRetries` (default 1).

## Reliability

- Runs always finish successfully — check `runStatus` in the run summary if results look empty
- Feeds are fetched in parallel; one slow or failed feed does not stop the rest
- Failed feeds are listed in the run summary with error details
- Keyword filters apply to **headline and summary only**, not publisher names
- Articles with missing dates are still included when `hoursBack` is set

## Pricing

Pay per article returned on Apify Store, plus a small run fee.

Free Apify plan users receive up to **25 articles per run**. Paid plans allow up to **500 articles per run**.

## Integrations

Schedule runs with Apify, or connect via **Make**, **Zapier**, **n8n**, and webhooks for automated news monitoring.

## FAQ

### Can I filter news by stock ticker?

Yes. Set `tickers` to symbols like `AAPL` or `TSLA`. Ticker filtering works alongside the default keyword filter — both must match unless you set `includeKeywords` to `[]`.

### Does this cover non-US markets?

Built-in presets use US-English finance feeds. For other regions, use `feedPreset: "custom"` with regional RSS URLs.

### How do I get all articles without keyword filtering?

Set `includeKeywords` to an empty array `[]`. By default, articles must contain at least one finance keyword (stock, market, earnings, etc.).

### How often should I run it?

For watchlist monitoring, every **15–60 minutes** during market hours works well.

### Why are some summaries empty?

Some publishers (e.g. Yahoo Finance) omit summaries in RSS. Headline, link, and date are still included.

### Why did I get zero articles?

Common causes: ticker or keyword filters too strict, `hoursBack` window too narrow, or all feeds failed. Check `runStatus` in the run summary and try relaxing filters or setting `includeKeywords` to `[]`.

### Is this legal?

The Actor reads public RSS feeds. Verify publisher terms if you redistribute commercially.

## Limitations

- Headlines and RSS summaries only — not full paywalled article text
- Ticker detection is best-effort — verify important matches manually
- Built-in feeds are US-English; add custom feeds for other regions
- Default keyword filter may exclude relevant articles that lack finance terms in the headline or summary

Use only feeds and content you are allowed to collect under applicable terms of service.

## Privacy and GDPR

This Actor collects publicly available RSS headlines and metadata from third-party publishers. It does not scrape personal profiles, login-gated content, or user account data. You are responsible for ensuring your use of collected data complies with applicable privacy laws (including GDPR) and publisher terms of service.

Report bugs or request features via the **Issues** tab on this Actor's Apify Store page or the linked GitHub repository.
