# AGENTS.md — Stock Market News Collector

Instructions for AI agents (MCP, Apify API, x402) that discover, call, or chain this Actor.

## Actor identity

| Field | Value |
| --- | --- |
| **Name** | `stock-market-news-collector` |
| **Title** | US Stock Market News Scraper \| Ticker Filter \| Bloomberg, Yahoo Finance |
| **Type** | RSS/Atom news aggregator (no browser, no login) |
| **Runtime** | Node.js, typically completes in seconds |

## When to use this Actor

Use when the user needs:

- Latest **US stock market news** headlines from Bloomberg, MarketWatch, or Yahoo Finance
- News filtered by **stock ticker** (`AAPL`, `TSLA`, `NVDA`) or company name
- **Structured JSON** articles for dashboards, alerts, RAG, or sentiment pipelines
- **Multi-source** finance news with deduplication and date filtering

Do **not** use when the user needs:

- Full paywalled article body text (RSS summaries only)
- Real-time tick-by-tick prices or order book data
- Non-RSS scraping of publisher websites

## Search keywords

`stock market news`, `financial news`, `Bloomberg news`, `MarketWatch scraper`, `Yahoo Finance news`, `ticker news`, `portfolio news alerts`, `RSS finance feed`, `equity headlines`, `earnings news`

## Outputs

### Primary: dataset (`articles`)

One item per news article. Key fields:

| Field | Type | Description |
| --- | --- | --- |
| `headline` | string | Article title (HTML stripped) |
| `source` | string | Publisher name |
| `publishedDate` | string | ISO 8601 publication time |
| `articleLink` | string | Canonical URL |
| `summary` | string | RSS summary, max 320 chars (may be empty) |
| `tickers` | string[] | Auto-detected symbols in headline/summary |
| `dedupeKey` | string | Stable ID for deduplication |

### Secondary: key-value store (`OUTPUT` / run summary)

Run metadata only — read the **default dataset** for article records.

| Field | Values | Meaning |
| --- | --- | --- |
| `runStatus` | `ok`, `partial`, `no_items`, `all_feeds_failed`, `error` | Always exit 0; check this for outcome |
| `count` | integer | Articles saved to dataset |
| `feedStats` | array | Per-feed raw/kept counts or errors |
| `failures` | array | Feeds that failed after retries |
| `freeTierLimited` | boolean | True when output was capped at 25 items (free Apify plan) |

## Recommended inputs

### US market headlines (default)

```json
{
  "feedPreset": "us_markets",
  "maxItems": 50,
  "hoursBack": 24
}
```

### Watchlist by ticker

**Note:** Default `includeKeywords` also applies. Both ticker and keyword filters must match unless `includeKeywords` is `[]`.

```json
{
  "feedPreset": "us_markets",
  "tickers": ["AAPL", "TSLA"],
  "tickerMatchMode": "any",
  "maxItems": 50,
  "hoursBack": 24
}
```

### All RSS articles (no keyword filter)

```json
{
  "feedPreset": "us_markets",
  "includeKeywords": [],
  "maxItems": 50,
  "hoursBack": 24
}
```

### Custom regional feeds

```json
{
  "feedPreset": "custom",
  "feeds": [{ "name": "FT Markets", "url": "https://www.ft.com/markets?format=rss" }],
  "includeKeywords": [],
  "maxItems": 50
}
```

## Common mistakes

1. **Zero results with tickers** — default finance keyword filter may exclude articles. Set `includeKeywords: []` if needed.
2. **Assuming run failed on empty dataset** — Actor always succeeds; check `OUTPUT.runStatus === "no_items"`.
3. **Expecting full article text** — only RSS headline/summary is available.
4. **Using `global_markets` for non-US** — preset still uses US-English sources; use `custom` feeds for other regions.
5. **Free tier item cap** — free Apify plan users receive at most **25 articles per run** regardless of `maxItems`. Paid plans allow up to 500.

## Apify API

```javascript
const run = await client.actor('USERNAME/stock-market-news-collector').call({
  tickers: ['AAPL'],
  maxItems: 25,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
const output = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT');
```

## MCP discovery

Agents can find this Actor via Apify MCP tools:

- `search-actors` — query: `stock market news`, `finance news RSS`, `Bloomberg news`
- `fetch-actor-details` — returns input schema, output schema, dataset field metadata, README

Hosted MCP (`https://mcp.apify.com`) infers output schemas from dataset definitions — ensure `fetch-actor-details` is called before the first run.

## Chaining with other Actors

| Downstream need | Suggested field |
| --- | --- |
| Fetch full article HTML | Pass `articleLink` to a web scraper Actor |
| Sentiment analysis | Pass `headline` + `summary` |
| Alert on new items | Schedule runs; compare `dedupeKey` across runs |
| RAG embedding | Use `headline`, `summary`, `publishedDate`, `source` |

## Schema files

| File | Purpose |
| --- | --- |
| `.actor/input_schema.json` | Input validation and UI |
| `.actor/output_schema.json` | Output tab links for dataset + run summary |
| `.actor/dataset_schema.json` | Per-field types, descriptions, examples for agents |
| `.actor/key_value_store_schema.json` | OUTPUT key validation |
