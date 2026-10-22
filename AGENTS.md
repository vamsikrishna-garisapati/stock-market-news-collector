# AGENTS.md — Stock Market News Collector

Instructions for AI agents (MCP, Apify API, x402) that discover, call, or chain this Actor.

## Actor identity

| Field | Value |
| --- | --- |
| **Name** | `stock-market-news-collector` |
| **Title** | Stock Market News Scraper \| Tickers, Google News, India, Crypto |
| **Type** | RSS/Atom news aggregator with Google News search (no browser, no login) |
| **Runtime** | Node.js, typically completes in seconds (longer with `includeFullText`) |

## When to use this Actor

Use when the user needs:

- Latest **stock market news** from Bloomberg, MarketWatch, CNBC, Yahoo Finance, Economic Times, Mint, or crypto outlets
- News about **any company, topic, or country** via Google News search
- News filtered by **stock ticker** (`AAPL`, `TSLA`, `RELIANCE.NS`) or company name
- **Sentiment, event tags, and company details** per article
- **Only new articles** on scheduled runs (alerts)
- **Structured JSON** for dashboards, alerts, RAG, or sentiment pipelines, optionally with full article text

Do **not** use when the user needs:

- Paywalled article bodies (Bloomberg, WSJ, FT, Barron's are skipped)
- Real-time tick-by-tick prices or order book data
- Historical news archives beyond what RSS feeds and Google News currently return

## Search keywords

`stock market news`, `company news API`, `financial news`, `Google News finance`, `ticker news`, `India stock news`, `crypto news`, `news sentiment`, `earnings news`, `portfolio news alerts`

## Outputs

### Primary: dataset (`articles`)

One item per news article. Key fields:

| Field | Type | Description |
| --- | --- | --- |
| `headline` | string | Article title (HTML stripped) |
| `source` | string | Publisher name |
| `publishedDate` | string | ISO 8601 publication time |
| `articleLink` | string | Canonical URL (Google News redirect URL for search results) |
| `summary` | string | RSS summary, max 320 chars (empty for Google News results) |
| `tickers` | string[] | Symbols detected from text, company names, or per-ticker feeds |
| `companyDetails` | object[] | `{ ticker, name, exchange, sector }` when `enrichArticles` is on (default) |
| `eventTypes` | string[] | earnings, guidance, mergers_acquisitions, analyst_rating, ipo, dividends_buybacks, legal_regulatory, executive_change, layoffs_restructuring, macro |
| `sentimentScore` / `sentimentLabel` | number / string | -1 to 1; positive, negative, neutral |
| `searchQuery` | string \| null | Google News query that produced the article |
| `fullText` / `fullTextStatus` | string \| null / string | Only when `includeFullText` is true |
| `dedupeKey` | string | Stable ID for deduplication |

### Secondary: key-value store (`OUTPUT` / run summary)

Run metadata only — read the **default dataset** for article records.

| Field | Values | Meaning |
| --- | --- | --- |
| `runStatus` | `ok`, `partial`, `no_items`, `no_new_items`, `all_feeds_failed`, `error` | Exit code is 0 unless `failOnAllFeedsFailed` is set; check this for outcome |
| `count` | integer | Articles saved to dataset |
| `skippedAlreadySeen` | integer | Articles skipped by `onlyNewArticles` |
| `spendingLimitReached` | boolean | Output cut to stay within the user's maximum cost per run |
| `feedStats` | array | Per-feed raw/kept counts or errors |
| `failures` | array | Feeds that failed after retries |

## Recommended inputs

### US market headlines (default)

```json
{ "feedPreset": "us_markets", "maxItems": 50, "hoursBack": 24 }
```

### Watchlist alert (scheduled)

Each ticker adds its Yahoo Finance headline feed (max 20 tickers; disable with `useTickerFeeds: false`). Known company names (Apple, Nvidia, Infosys, ...) also count as ticker matches. The default finance keyword filter is skipped when `tickers`, `companies`, or `searchQueries` are set.

```json
{
  "feedPreset": "us_markets",
  "tickers": ["AAPL", "TSLA"],
  "onlyNewArticles": true,
  "hoursBack": 24
}
```

### Any company, topic, or country (Google News)

```json
{
  "feedPreset": "none",
  "searchQueries": ["Reliance Industries", "Apple OR AAPL"],
  "searchLanguage": "en",
  "searchCountry": "IN",
  "maxItems": 50
}
```

### India or crypto

```json
{ "feedPreset": "india_markets", "maxItems": 50 }
```

```json
{ "feedPreset": "crypto", "maxItems": 50, "hoursBack": 48 }
```

### Full text for RAG

```json
{ "feedPreset": "none", "tickers": ["NVDA"], "includeFullText": true, "maxItems": 20 }
```

### Custom feeds

```json
{
  "feedPreset": "custom",
  "feeds": [{ "name": "My feed", "url": "https://example.com/rss.xml" }],
  "includeKeywords": [],
  "maxItems": 50
}
```

## Common mistakes

1. **Zero results with tickers** — usually an explicit `includeKeywords` list or a short `hoursBack` window. Omit `includeKeywords` (or set `[]`) and keep `useTickerFeeds` on.
2. **Assuming run failed on empty dataset** — check `OUTPUT.runStatus`: `no_new_items` means `onlyNewArticles` already returned everything; `no_items` means filters matched nothing.
3. **Expecting full text by default** — set `includeFullText: true`; paywalled publishers and Google News links return `fullTextStatus` `paywalled` or `unsupported`.
4. **Expecting publisher URLs from Google News** — `articleLink` is a news.google.com redirect; `source` is the real publisher.
5. **Sharing `onlyNewArticles` history unintentionally** — history is separated by sources and filters; pass distinct `stateKey` values (stored encrypted) to separate runs with identical setups.

## Apify API

```javascript
const run = await client.actor('USERNAME/stock-market-news-collector').call({
  tickers: ['AAPL'],
  onlyNewArticles: true,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
const output = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT');
```

## MCP discovery

Agents can find this Actor via Apify MCP tools:

- `search-actors` — query: `stock market news`, `company news`, `Google News finance`, `crypto news`
- `fetch-actor-details` — returns input schema, output schema, dataset field metadata, README

Hosted MCP (`https://mcp.apify.com`) infers output schemas from dataset definitions — ensure `fetch-actor-details` is called before the first run.

## Chaining with other Actors

| Downstream need | Suggested field |
| --- | --- |
| Article body | Use `includeFullText`, or pass `articleLink` to a web scraper Actor for skipped sites |
| Deeper sentiment / LLM analysis | Pass `headline`, `summary`, `fullText` |
| Alert on new items | Schedule runs with `onlyNewArticles: true` and a webhook |
| RAG embedding | Use `headline`, `fullText` or `summary`, `publishedDate`, `source`, `tickers` |

## Development

| Command | Purpose |
| --- | --- |
| `pnpm test` | Unit tests |
| `pnpm check:feeds` | Live health check of all built-in feeds (also runs daily in GitHub Actions) |

## Schema files

| File | Purpose |
| --- | --- |
| `.actor/input_schema.json` | Input validation and UI |
| `.actor/output_schema.json` | Output tab links for dataset + run summary |
| `.actor/dataset_schema.json` | Per-field types, descriptions, examples for agents |
| `.actor/key_value_store_schema.json` | OUTPUT key validation |
