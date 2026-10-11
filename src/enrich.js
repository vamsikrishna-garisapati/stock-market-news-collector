import { escapeRegex } from './utils.js';

/**
 * Aliases are matched case-sensitively on word boundaries. Names that are also
 * common words (Target, Visa, Block, Shell, Lucid, Arm) only match in their
 * unambiguous long form.
 */
const COMPANY_DIRECTORY = [
    ['AAPL', 'Apple Inc.', 'NASDAQ', 'Technology', ['Apple']],
    ['MSFT', 'Microsoft Corp.', 'NASDAQ', 'Technology', ['Microsoft']],
    ['NVDA', 'Nvidia Corp.', 'NASDAQ', 'Technology', ['Nvidia', 'NVIDIA']],
    ['GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Communication Services', ['Alphabet', 'Google']],
    ['AMZN', 'Amazon.com Inc.', 'NASDAQ', 'Consumer Discretionary', ['Amazon']],
    ['META', 'Meta Platforms Inc.', 'NASDAQ', 'Communication Services', ['Meta Platforms', 'Meta', 'Facebook']],
    ['TSLA', 'Tesla Inc.', 'NASDAQ', 'Consumer Discretionary', ['Tesla']],
    ['AVGO', 'Broadcom Inc.', 'NASDAQ', 'Technology', ['Broadcom']],
    ['NFLX', 'Netflix Inc.', 'NASDAQ', 'Communication Services', ['Netflix']],
    ['AMD', 'Advanced Micro Devices Inc.', 'NASDAQ', 'Technology', ['Advanced Micro Devices', 'AMD']],
    ['INTC', 'Intel Corp.', 'NASDAQ', 'Technology', ['Intel']],
    ['QCOM', 'Qualcomm Inc.', 'NASDAQ', 'Technology', ['Qualcomm']],
    ['MU', 'Micron Technology Inc.', 'NASDAQ', 'Technology', ['Micron']],
    ['CSCO', 'Cisco Systems Inc.', 'NASDAQ', 'Technology', ['Cisco']],
    ['ADBE', 'Adobe Inc.', 'NASDAQ', 'Technology', ['Adobe']],
    ['PLTR', 'Palantir Technologies Inc.', 'NASDAQ', 'Technology', ['Palantir']],
    ['SMCI', 'Super Micro Computer Inc.', 'NASDAQ', 'Technology', ['Super Micro', 'Supermicro']],
    ['ARM', 'Arm Holdings plc', 'NASDAQ', 'Technology', ['Arm Holdings']],
    ['MSTR', 'Strategy Inc. (MicroStrategy)', 'NASDAQ', 'Technology', ['MicroStrategy']],
    ['COIN', 'Coinbase Global Inc.', 'NASDAQ', 'Financials', ['Coinbase']],
    ['PYPL', 'PayPal Holdings Inc.', 'NASDAQ', 'Financials', ['PayPal']],
    ['ABNB', 'Airbnb Inc.', 'NASDAQ', 'Consumer Discretionary', ['Airbnb']],
    ['COST', 'Costco Wholesale Corp.', 'NASDAQ', 'Consumer Staples', ['Costco']],
    ['PEP', 'PepsiCo Inc.', 'NASDAQ', 'Consumer Staples', ['PepsiCo', 'Pepsi']],
    ['SBUX', 'Starbucks Corp.', 'NASDAQ', 'Consumer Discretionary', ['Starbucks']],
    ['CMCSA', 'Comcast Corp.', 'NASDAQ', 'Communication Services', ['Comcast']],
    ['MRNA', 'Moderna Inc.', 'NASDAQ', 'Health Care', ['Moderna']],
    ['RIVN', 'Rivian Automotive Inc.', 'NASDAQ', 'Consumer Discretionary', ['Rivian']],
    ['LCID', 'Lucid Group Inc.', 'NASDAQ', 'Consumer Discretionary', ['Lucid Group', 'Lucid Motors']],
    ['WMT', 'Walmart Inc.', 'NASDAQ', 'Consumer Staples', ['Walmart']],
    ['ORCL', 'Oracle Corp.', 'NYSE', 'Technology', ['Oracle']],
    ['IBM', 'International Business Machines Corp.', 'NYSE', 'Technology', ['IBM']],
    ['CRM', 'Salesforce Inc.', 'NYSE', 'Technology', ['Salesforce']],
    ['DELL', 'Dell Technologies Inc.', 'NYSE', 'Technology', ['Dell']],
    ['TSM', 'Taiwan Semiconductor Manufacturing Co.', 'NYSE', 'Technology', ['TSMC', 'Taiwan Semiconductor']],
    ['UBER', 'Uber Technologies Inc.', 'NYSE', 'Industrials', ['Uber']],
    ['SPOT', 'Spotify Technology S.A.', 'NYSE', 'Communication Services', ['Spotify']],
    ['DIS', 'The Walt Disney Co.', 'NYSE', 'Communication Services', ['Disney']],
    ['T', 'AT&T Inc.', 'NYSE', 'Communication Services', ['AT&T']],
    ['VZ', 'Verizon Communications Inc.', 'NYSE', 'Communication Services', ['Verizon']],
    ['JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Financials', ['JPMorgan', 'JP Morgan']],
    ['GS', 'Goldman Sachs Group Inc.', 'NYSE', 'Financials', ['Goldman Sachs', 'Goldman']],
    ['MS', 'Morgan Stanley', 'NYSE', 'Financials', ['Morgan Stanley']],
    ['BAC', 'Bank of America Corp.', 'NYSE', 'Financials', ['Bank of America', 'BofA']],
    ['WFC', 'Wells Fargo & Co.', 'NYSE', 'Financials', ['Wells Fargo']],
    ['C', 'Citigroup Inc.', 'NYSE', 'Financials', ['Citigroup', 'Citi']],
    ['BLK', 'BlackRock Inc.', 'NYSE', 'Financials', ['BlackRock']],
    ['BRK.B', 'Berkshire Hathaway Inc.', 'NYSE', 'Financials', ['Berkshire Hathaway', 'Berkshire']],
    ['V', 'Visa Inc.', 'NYSE', 'Financials', ['Visa Inc']],
    ['MA', 'Mastercard Inc.', 'NYSE', 'Financials', ['Mastercard']],
    ['AXP', 'American Express Co.', 'NYSE', 'Financials', ['American Express', 'Amex']],
    ['XOM', 'Exxon Mobil Corp.', 'NYSE', 'Energy', ['ExxonMobil', 'Exxon Mobil', 'Exxon']],
    ['CVX', 'Chevron Corp.', 'NYSE', 'Energy', ['Chevron']],
    ['JNJ', 'Johnson & Johnson', 'NYSE', 'Health Care', ['Johnson & Johnson', 'J&J']],
    ['UNH', 'UnitedHealth Group Inc.', 'NYSE', 'Health Care', ['UnitedHealth']],
    ['LLY', 'Eli Lilly and Co.', 'NYSE', 'Health Care', ['Eli Lilly']],
    ['PFE', 'Pfizer Inc.', 'NYSE', 'Health Care', ['Pfizer']],
    ['MRK', 'Merck & Co. Inc.', 'NYSE', 'Health Care', ['Merck']],
    ['ABBV', 'AbbVie Inc.', 'NYSE', 'Health Care', ['AbbVie']],
    ['KO', 'The Coca-Cola Co.', 'NYSE', 'Consumer Staples', ['Coca-Cola']],
    ['MCD', "McDonald's Corp.", 'NYSE', 'Consumer Discretionary', ["McDonald's", 'McDonald’s']],
    ['NKE', 'Nike Inc.', 'NYSE', 'Consumer Discretionary', ['Nike']],
    ['HD', 'The Home Depot Inc.', 'NYSE', 'Consumer Discretionary', ['Home Depot']],
    ['TGT', 'Target Corp.', 'NYSE', 'Consumer Staples', ['Target Corp']],
    ['GME', 'GameStop Corp.', 'NYSE', 'Consumer Discretionary', ['GameStop']],
    ['F', 'Ford Motor Co.', 'NYSE', 'Consumer Discretionary', ['Ford Motor', 'Ford']],
    ['GM', 'General Motors Co.', 'NYSE', 'Consumer Discretionary', ['General Motors', 'GM']],
    ['BA', 'Boeing Co.', 'NYSE', 'Industrials', ['Boeing']],
    ['CAT', 'Caterpillar Inc.', 'NYSE', 'Industrials', ['Caterpillar']],
    ['LMT', 'Lockheed Martin Corp.', 'NYSE', 'Industrials', ['Lockheed Martin', 'Lockheed']],
    ['BABA', 'Alibaba Group Holding Ltd.', 'NYSE', 'Consumer Discretionary', ['Alibaba']],
    ['SHOP', 'Shopify Inc.', 'NASDAQ', 'Technology', ['Shopify']],
    ['RELIANCE.NS', 'Reliance Industries Ltd.', 'NSE', 'Energy', ['Reliance Industries', 'Reliance']],
    ['TCS.NS', 'Tata Consultancy Services Ltd.', 'NSE', 'Technology', ['Tata Consultancy Services', 'TCS']],
    ['INFY.NS', 'Infosys Ltd.', 'NSE', 'Technology', ['Infosys']],
    ['WIPRO.NS', 'Wipro Ltd.', 'NSE', 'Technology', ['Wipro']],
    ['HDFCBANK.NS', 'HDFC Bank Ltd.', 'NSE', 'Financials', ['HDFC Bank']],
    ['ICICIBANK.NS', 'ICICI Bank Ltd.', 'NSE', 'Financials', ['ICICI Bank']],
    ['SBIN.NS', 'State Bank of India', 'NSE', 'Financials', ['State Bank of India', 'SBI']],
    ['BAJFINANCE.NS', 'Bajaj Finance Ltd.', 'NSE', 'Financials', ['Bajaj Finance']],
    ['BHARTIARTL.NS', 'Bharti Airtel Ltd.', 'NSE', 'Communication Services', ['Bharti Airtel', 'Airtel']],
    ['ITC.NS', 'ITC Ltd.', 'NSE', 'Consumer Staples', ['ITC']],
    ['HINDUNILVR.NS', 'Hindustan Unilever Ltd.', 'NSE', 'Consumer Staples', ['Hindustan Unilever', 'HUL']],
    ['LT.NS', 'Larsen & Toubro Ltd.', 'NSE', 'Industrials', ['Larsen & Toubro', 'L&T']],
    ['MARUTI.NS', 'Maruti Suzuki India Ltd.', 'NSE', 'Consumer Discretionary', ['Maruti Suzuki', 'Maruti']],
    ['ADANIENT.NS', 'Adani Enterprises Ltd.', 'NSE', 'Industrials', ['Adani Enterprises']],
].map(([ticker, name, exchange, sector, aliases]) => ({
    ticker,
    name,
    exchange,
    sector,
    pattern: new RegExp(`(?<![A-Za-z0-9&])(?:${aliases.map(escapeRegex).join('|')})(?![A-Za-z0-9&])`),
}));

const COMPANY_BY_TICKER = new Map(COMPANY_DIRECTORY.map((company) => [company.ticker, company]));

const EVENT_PATTERNS = {
    earnings: [/\b(earnings|quarterly results|eps|q[1-4] (results|revenue|profit|sales)|(beats?|miss(es|ed)?|tops) (estimates|expectations|forecasts)|revenue (beat|miss)|profit (rises|falls|jumps|drops))\b/i],
    guidance: [/\b(guidance|(raises|cuts|lowers|reaffirms|boosts) (its )?(forecast|outlook|guidance)|full-year (forecast|outlook))\b/i],
    mergers_acquisitions: [/\b(acquir(e|es|ed|ing)|acquisition|merger|merge with|buyout|takeover|deal to buy|agrees to buy|bid for|stake in)\b/i],
    analyst_rating: [/\b(upgrad(e|es|ed)|downgrad(e|es|ed)|price target|initiat(es|ed) coverage|overweight|underweight|outperform rating|underperform|buy rating|sell rating)\b/i],
    ipo: [/\b(ipo|initial public offering|goes public|going public|market debut|listing debut|shares debut)\b/i],
    dividends_buybacks: [/\b(dividends?|buybacks?|share repurchase|stock repurchase|repurchase program)\b/i],
    legal_regulatory: [/\b(lawsuit|sued|sues|settlement|antitrust|probe|investigation|regulators?|sec charges|fined|penalty|class action)\b/i],
    executive_change: [/\b(ceo (steps down|resigns|to step down|exits)|names (new )?(ceo|cfo|chief)|appoints|resigns|stepping down|succession)\b/i],
    layoffs_restructuring: [/\b(layoffs?|job cuts|cut(s|ting)? jobs|restructuring|workforce reduction)\b/i],
    macro: [
        /\b(Fed|FOMC|RBI|ECB|CPI|PPI|GDP)\b/,
        /\b(federal reserve|interest rates?|rate (cut|hike)s?|inflation|jobs report|nonfarm payrolls|recession|treasury yields?)\b/i,
    ],
};

const POSITIVE_WORD = /^(beats?|beating|surg(e|es|ed|ing)|soar(s|ed|ing)?|rall(y|ies|ied|ying)|jump(s|ed|ing)?|gain(s|ed|ing)?|highs|upgrad(e|es|ed)|outperform(s|ed)?|tops|topped|rebound(s|ed|ing)?|climb(s|ed|ing)?|rises?|rising|rose|boost(s|ed)?|strong(er)?|bullish|optimis(m|tic)|recover(s|ed|y)|profits?|profitable|wins?|won|approv(al|ed|es)|growth)$/;
const NEGATIVE_WORD = /^(miss(es|ed)?|plung(e|es|ed|ing)|tumbl(e|es|ed|ing)|slump(s|ed|ing)?|falls?|falling|fell|drop(s|ped|ping)?|downgrad(e|es|ed)|loss(es)?|weak(er|ness)?|lawsuits?|probes?|warn(s|ed|ing)?|slid(e|es|ing)?|sinks?|sank|layoffs?|bankrupt(cy)?|recalls?|fraud|bearish|sell-?offs?|selloffs?|crash(es|ed)?|slash(es|ed)?|declin(e|es|ed|ing)|concerns?|fears?|plummet(s|ed|ing)?|sued|cuts?)$/;
const NEGATORS = new Set(['not', 'no', 'never', 'without', "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "can't", 'fails', 'failed', 'unlikely']);
const NEGATION_WINDOW = 4;
const HEADLINE_WEIGHT = 2;

function toCompanyDetails({ ticker, name, exchange, sector }) {
    return { ticker, name, exchange, sector };
}

export function detectCompanies(text, tickers = []) {
    const found = new Map();

    for (const company of COMPANY_DIRECTORY) {
        if (company.pattern.test(text)) found.set(company.ticker, toCompanyDetails(company));
    }

    for (const ticker of tickers) {
        if (!found.has(ticker) && COMPANY_BY_TICKER.has(ticker)) {
            found.set(ticker, toCompanyDetails(COMPANY_BY_TICKER.get(ticker)));
        }
    }

    return [...found.values()];
}

export function classifyEvents(text) {
    return Object.entries(EVENT_PATTERNS)
        .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
        .map(([type]) => type);
}

function countSentimentTerms(text, weight, totals) {
    const words = String(text).toLowerCase().replace(/[‘’]/g, "'").match(/[a-z][a-z'-]*/g) || [];

    words.forEach((word, index) => {
        let polarity = 0;
        if (POSITIVE_WORD.test(word)) polarity = 1;
        else if (NEGATIVE_WORD.test(word)) polarity = -1;
        if (!polarity) return;

        const negated = words.slice(Math.max(0, index - NEGATION_WINDOW), index).some((prior) => NEGATORS.has(prior));
        if (negated) polarity = -polarity;

        if (polarity > 0) totals.positive += weight;
        else totals.negative += weight;
    });
}

/** Lightweight finance word-list score; headline words count double and nearby negations flip polarity. */
export function scoreSentiment(headline, summary = '') {
    const totals = { positive: 0, negative: 0 };
    countSentimentTerms(headline, HEADLINE_WEIGHT, totals);
    countSentimentTerms(summary, 1, totals);

    const { positive, negative } = totals;
    const total = positive + negative;
    const score = total ? Math.round(((positive - negative) / total) * 100) / 100 : 0;

    let label = 'neutral';
    if (score >= 0.2) label = 'positive';
    else if (score <= -0.2) label = 'negative';

    return { score, label };
}