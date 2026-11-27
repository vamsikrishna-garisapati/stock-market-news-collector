## Stock Market News Scraper

Need finance headlines as **structured JSON** without maintaining scrapers for every publisher?

**Use it for:**

1. **Watchlist alerts** — schedule with tickers and `onlyNewArticles` so you only get new headlines
2. **Any company or topic** — Google News search by query, country, and language
3. **India / crypto / US markets** — curated presets for dashboards, sentiment triage, and AI/RAG

### 💹 Watchlist alert → Zapier / n8n / Slack

Schedule ticker news and send **only new headlines** to Zapier, n8n, Make, or Slack.

```json
{
  "feedPreset": "us_markets",
  "tickers": ["AAPL", "NVDA", "TSLA"],
  "onlyNewArticles": true,
  "hoursBack": 24
}
```

1. Paste your tickers and turn on **Only new articles**
2. Open **Schedules** and run every 15–60 minutes
3. Connect **Zapier**, **n8n**, **Make**, or a webhook for Slack

![Watchlist alerts via Apify → n8n → Slack](https://raw.githubusercontent.com/vamsikrishna-garisapati/stock-market-news-collector/main/.actor/screenshots/stock-market-news-slack-demo.gif)

Or leave the default **US markets** prefill (`us_markets`, 50 items, last 72 hours) and click **Start**.

**What this is:** Public **RSS feeds + Google News** → JSON. Headlines and metadata from sources that include MarketWatch, CNBC, Yahoo Finance, Economic Times, Mint, and crypto outlets — **not** paywalled full text from Bloomberg, WSJ, or FT. Optional `includeFullText` works only on non-paywalled pages.

Sentiment and event tags are best-effort, rule-based signals — **not investment advice**.

→ [Try the Actor on Apify](https://apify.com/vamsi-krishna/stock-market-news-collector)

## Screenshots

**Output (tickers/sentiment)**

![Output (tickers/sentiment)](https://raw.githubusercontent.com/vamsikrishna-garisapati/stock-market-news-collector/main/.actor/screenshots/01-output-tickers-sentiment.png)

**Input (watchlist)**

![Input (watchlist)](https://raw.githubusercontent.com/vamsikrishna-garisapati/stock-market-news-collector/main/.actor/screenshots/02-input-watchlist.png)

**India markets output**

![India markets output](https://raw.githubusercontent.com/vamsikrishna-garisapati/stock-market-news-collector/main/.actor/screenshots/03-india-markets-output.png)

## 🤖 For AI agents / MCP

This Actor is designed for MCP discovery and agentic runs:

- **Search terms:** stock market news, company news API, ticker news, Google News finance, India stock news, crypto news, financial news sentiment
- **Apify username:** `vamsi-krishna`
- **Actor name:** `stock-market-news-collector`
- **Full Actor ID:** `vamsi-krishna/stock-market-news-collector`
- **Primary output:** dataset items (`headline`, `articleLink`, `tickers`, `publishedDate`, `sentimentLabel`, `eventTypes`)
- **Run outcome:** succeeds by default — check `OUTPUT.runStatus` when `count` is 0
- **Agent guide:** see [AGENTS.md](./AGENTS.md) for input recipes, output fields, and common mistakes

**MCP / AGI readiness:** Limited permissions + pay-per-event pricing means this Actor is eligible for [Apify MCP](https://docs.apify.com/mcp) and [AGI prepaid](https://agi.apify.com/) agentic payments (x402 / MPP) and Skyfire when identity-verified. Agents that pay via AGI do not need a separate Apify account; humans still use Console or the API as today. Clients that filter for `allowsAgenticUsers` / limited-permission Actors can discover and run it automatically.

Apify MCP `fetch-actor-details` returns input schema, output schema, dataset field examples, and this README.

## 📰 What you get

Each article in the dataset:

```json
{
  "headline": "Why Nvidia's stock is dodging the AI credit scare crushing Broadcom and Oracle",
  "source": "MarketWatch Breaking News",
  "author": null,
  "publishedDate": "2026-10-10T20:06:24.000Z",
  "articleLink": "https://www.marketwatch.com/story/...",
  "summary": "Nvidia has held up better than other AI names...",
  "categories": [],
  "imageUrl": "https://...",
  "tickers": ["NVDA", "AVGO", "ORCL"],
  "companyDetails": [
    { "ticker": "NVDA", "name": "Nvidia Corp.", "exchange": "NASDAQ", "sector": "Technology" }
  ],
  "eventTypes": [],
  "sentimentScore": 0,
  "sentimentLabel": "neutral",
  "dedupeKey": "https://www.marketwatch.com/story/...",
  "sourceFeed": "https://feeds.content.dowjones.io/public/rss/mw_bulletins",
  "searchQuery": null,
  "fetchedAt": "2026-10-11T07:30:00.000Z"
}
```

With `includeFullText: true`, articles also get `fullText` and `fullTextStatus`.

Each run also produces a **run summary** in the Output tab: feed stats, failures, and `runStatus` (`ok`, `partial`, `no_items`, `no_new_items`, `all_feeds_failed`, or `error`).

## Use cases

- **Watchlist alerts** — schedule a run every 15 minutes with `tickers` and `onlyNewArticles`, then send new items to Slack, Discord, Telegram, or email
- **Company and topic monitoring** — Google News search for any company, product, or theme, in any country and language
- **India and crypto coverage** — dedicated presets for Economic Times, Mint, CoinDesk, Cointelegraph, Decrypt, and The Block
- **Sentiment and event pipelines** — sentiment score and event tags (earnings, M&A, analyst ratings, lawsuits, ...) on every article
- **AI and RAG datasets** — structured news with optional full article text

## How to use this stock market news scraper

1. Choose a **Feed preset**, add **Google News search queries**, or both.
2. Optionally set **Stock tickers**, **Company names**, or **Include keywords**.
3. For scheduled alerts, turn on **Only new articles**.
4. Click **Start** — results appear in the Output tab within seconds. Download as JSON, CSV, or Excel, or use the [Apify API](https://docs.apify.com/api/v2).

### Watchlist variants

Primary watchlist recipe (tickers + `onlyNewArticles` + schedule) is at the top. Each ticker also pulls its Yahoo Finance headline feed; names like "Apple" or "Nvidia" count as ticker matches in the preset feeds.

Negative earnings-only alert:

```json
{
  "feedPreset": "us_markets",
  "tickers": ["AAPL"],
  "onlyNewArticles": true,
  "filterEventTypes": ["earnings"],
  "maxSentimentScore": -0.1
}
```

Lean Zapier / Slack payload (fewer fields):

```json
{
  "feedPreset": "us_markets",
  "maxItems": 30,
  "hoursBack": 24,
  "outputFields": ["tickers", "sentimentLabel", "publishedDate"]
}
```

(`headline`, `articleLink`, `source`, and `fetchedAt` are always included so the dataset schema stays valid.)

30-day research backfill:

```json
{ "feedPreset": "us_markets", "maxItems": 100, "hoursBack": 720 }
```

### Google News search, any company or country

```json
{
  "feedPreset": "none",
  "searchQueries": ["Reliance Industries", "Infosys"],
  "searchLanguage": "en",
  "searchCountry": "IN",
  "maxItems": 50
}
```

Google News operators work: `"Apple OR AAPL"`, `"lithium site:reuters.com"`, `"nvidia when:7d"`.

### India markets or crypto

```json
{ "feedPreset": "india_markets", "maxItems": 100 }
```

```json
{ "feedPreset": "crypto", "maxItems": 50, "hoursBack": 48 }
```

### Full article text for RAG

```json
{
  "feedPreset": "none",
  "tickers": ["TSLA"],
  "includeFullText": true,
  "fullTextMaxChars": 10000,
  "maxItems": 20
}
```

### Custom RSS feeds

```json
{
  "feedPreset": "custom",
  "feeds": [{ "name": "My feed", "url": "https://example.com/rss.xml" }],
  "includeKeywords": [],
  "maxItems": 50
}
```

## Apify API

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_APIFY_TOKEN' });
const run = await client.actor('vamsi-krishna/stock-market-news-collector').call({
    tickers: ['AAPL', 'NVDA'],
    onlyNewArticles: true,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
const { value: output } = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT');
console.log(items, output?.runStatus);
```

### Python (`apify-client`)

```python
from apify_client import ApifyClient

client = ApifyClient('YOUR_APIFY_TOKEN')
run = client.actor('vamsi-krishna/stock-market-news-collector').call(run_input={
    'tickers': ['AAPL', 'NVDA'],
    'onlyNewArticles': True,
})
items = client.dataset(run['defaultDatasetId']).list_items().items
output = client.key_value_store(run['defaultKeyValueStoreId']).get_record('OUTPUT')['value']
print(len(items), output.get('runStatus'))
```

### curl (sync dataset items)

```bash
curl -X POST \
  "https://api.apify.com/v2/acts/vamsi-krishna~stock-market-news-collector/run-sync-get-dataset-items?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tickers":["AAPL","NVDA"],"onlyNewArticles":true,"maxItems":20}'
```

To read the run summary (`runStatus`, feed stats) after an async run, fetch the `OUTPUT` record from the run’s default key-value store:

```bash
curl "https://api.apify.com/v2/key-value-stores/STORE_ID/records/OUTPUT?token=YOUR_APIFY_TOKEN"
```

## Feed presets

| Preset | Sources | Best for |
| --- | --- | --- |
| `us_markets` (default) | MarketWatch Top Stories, MarketWatch Breaking News, CNBC Investing, Bloomberg Markets | US equities and market headlines |
| `global_markets` | Bloomberg Markets, CNBC International, MarketWatch Top Stories | Broader coverage (English-language sources) |
| `earnings` | CNBC Earnings, CNBC Investing, Bloomberg Markets | Earnings and corporate news |
| `india_markets` | Economic Times, Mint, Business Standard, Hindu Business Line, Moneycontrol, NDTV Profit | Indian equities, Nifty and Sensex |
| `crypto` | CoinDesk, Cointelegraph, Decrypt, The Block | Crypto markets |
| `none` | Nothing | Use only search queries and ticker feeds |
| `custom` | Your own RSS URLs | Any region or publisher |

Search queries and ticker feeds are added on top of any preset.

## Input parameters

| Field | Default | Description |
| --- | --- | --- |
| `feedPreset` | `us_markets` | Feed bundle, `none`, or `custom` |
| `searchQueries` | `[]` | Google News searches (max 10) |
| `searchLanguage` / `searchCountry` | `en` / `US` | Locale for Google News searches |
| `feeds` | `[]` | RSS URLs when preset is `custom` |
| `tickers` | `[]` | Filter by symbols and fetch each symbol's Yahoo Finance feed |
| `useTickerFeeds` | `true` | Fetch per-ticker Yahoo Finance feeds when `tickers` are set |
| `companies` | `[]` | Filter by company name in headline/summary |
| `tickerMatchMode` | `any` | `any` or `all` tickers must match |
| `includeKeywords` | unset (see below) | Match headline + summary; set `[]` to disable |
| `excludeKeywords` | `[]` | Exclude matching articles |
| `hoursBack` | `72` | Only articles from the last N hours (max 720 = 30 days; `0` = no date filter) |
| `maxItems` | `50` | Max articles returned (up to 500) |
| `outputFields` | `[]` | Restrict dataset fields (e.g. for Zapier); empty = all. Always keeps `headline`, `articleLink`, `source`, `fetchedAt` |
| `onlyNewArticles` | `false` | Skip articles returned by earlier runs with the same setup |
| `stateKey` | auto | Optional name for the `onlyNewArticles` history. Stored encrypted. |
| `enrichArticles` | `true` | Add company details, event types, and sentiment |
| `filterEventTypes` | `[]` | Keep articles with at least one of these event types (OR) |
| `minSentimentScore` / `maxSentimentScore` | unset | Inclusive sentiment bounds (-1 to 1); unset disables |
| `includeFullText` | `false` | Fetch and extract the article body |
| `failOnAllFeedsFailed` | `false` | Mark the run FAILED when every feed fails, so monitoring alerts you |

Advanced: `maxItemsPerFeed`, `fullTextMaxChars` (default 10000), `deduplicate` (default true), `requestTimeoutMs` (default 15000), `feedRetries` (default 1).

Curated presets (`us_markets`, `global_markets`, `earnings`, `india_markets`, `crypto`) do **not** auto-apply finance keywords — their feeds are already on-topic. Built-in finance keywords apply only for `custom` / an explicit feeds list when you leave `includeKeywords` unset and set no tickers, companies, or search queries.

## Enrichment

- **`companyDetails`** — about 85 well-known US and Indian companies are recognized by name or ticker, with exchange and sector
- **`eventTypes`** — `earnings`, `guidance`, `mergers_acquisitions`, `analyst_rating`, `ipo`, `dividends_buybacks`, `legal_regulatory`, `executive_change`, `layoffs_restructuring`, `macro`
- **`sentimentScore`** / **`sentimentLabel`** — finance word-list score from -1 to 1; headline words count double and negations ("won't", "not") flip polarity

Enrichment is rule-based and fast. Treat it as a first-pass signal, not investment advice.

## 🔔 Only new articles

With `onlyNewArticles: true`, the Actor remembers which articles each setup has returned (for 14 days) in a named key-value store, `stock-market-news-state`, in your account. Runs with the same sources and filters share history, so separate watchlists don't hide each other's news. Set `stateKey` to share or separate history explicitly. That value is stored encrypted. When nothing is new, `runStatus` is `no_new_items` and no articles are charged.

## Reliability

- Runs finish successfully by default — check `runStatus` in the run summary if results look empty, or set `failOnAllFeedsFailed` to get a FAILED run when every feed is down
- Feeds are fetched in parallel; one slow or failed feed does not stop the rest
- Failed feeds are listed in the run summary with error details
- Built-in feeds are health-checked daily
- Articles with missing dates are still included when `hoursBack` is set

## 💰 How much does stock market news scraping cost?

**50 headlines ≈ $0.10.** A small start fee applies each run. With `onlyNewArticles`, scheduled runs do not re-charge for headlines already returned.

On the FREE plan that is **$0.0025 per article** and about **$0.00005** to start (1 GB). Silver subscribers pay 10% less and Gold / higher tiers pay 20% less. Runs also stop at your **maximum cost per run**.

## Integrations

Schedule runs with Apify, or connect via **Make**, **Zapier**, **n8n**, Slack, and webhooks for automated news monitoring.

## ❓ FAQ

### Why use this instead of a Google News scraper / NewsAPI?

Generic Google News scrapers return search hits only. NewsAPI-style products often need a separate key, rate limits, and no finance presets. This Actor combines **curated US / India / crypto RSS presets**, **per-ticker Yahoo Finance feeds**, **Google News search**, and **built-in enrichment** (tickers, company details, event tags, sentiment) plus **`onlyNewArticles`** for scheduled Slack/Zapier alerts — one Actor, structured JSON, no login.

### Can I filter news by stock ticker?

Yes. Set `tickers` to symbols like `AAPL` or `RELIANCE.NS`. The Actor adds each ticker's Yahoo Finance headline feed and keeps preset articles that mention the symbol or a known company name.

### Does this cover non-US markets?

Yes. Use the `india_markets` preset, or Google News `searchQueries` with `searchCountry` and `searchLanguage` for any country. `custom` accepts any RSS feed.

### Why do Google News results link to news.google.com?

Google News RSS starts as redirect links. The Actor resolves `articleLink` to the publisher URL when possible (best-effort, no browser); on failure it keeps the Google News redirect. `source` is always the publisher name. Full text still skips unresolved `news.google.com` links.

### How do I get all articles without keyword filtering?

Curated presets already skip automatic finance keywords. For `custom` feeds, set `includeKeywords` to `[]`.

### Why did I get zero articles?

Usually an explicit `includeKeywords` list, a short `hoursBack` window, or `onlyNewArticles` with nothing new. Clear keywords (or set `[]`) and keep `useTickerFeeds` on when using tickers. Check `runStatus`: `no_new_items` means everything was already returned; `no_items` means filters matched nothing; `all_feeds_failed` lists errors in `failures`. The run still succeeds by default.

### Is this legal?

The Actor reads public RSS feeds and, optionally, publicly accessible article pages. Verify publisher terms if you redistribute content commercially.

## Limitations

- Full text skips paywalled publishers (Bloomberg, WSJ, FT, Barron's) and some sites block automated requests
- Ticker detection, company recognition, event tags, and sentiment are best-effort
- Google News `articleLink` is resolved to the publisher URL when possible; otherwise the redirect is kept

Use only feeds and content you are allowed to collect under applicable terms of service.

## Privacy and GDPR

This Actor collects publicly available news headlines and metadata from third-party publishers. It does not scrape personal profiles, login-gated content, or user account data. You are responsible for ensuring your use of collected data complies with applicable privacy laws (including GDPR) and publisher terms of service.

Report bugs or request features via the **Issues** tab on this Actor's Apify Store page or the linked GitHub repository.

If this saved you time, a review helps other builders find it.
