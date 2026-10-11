import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvents, detectCompanies, scoreSentiment } from '../src/enrich.js';

describe('detectCompanies', () => {
    it('finds companies by name and returns their details', () => {
        const companies = detectCompanies('Apple hires podcast startup team as Nvidia nears $6 trillion');
        assert.deepEqual(companies.map((c) => c.ticker).sort(), ['AAPL', 'NVDA']);
        assert.deepEqual(companies.find((c) => c.ticker === 'AAPL'), {
            ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology',
        });
    });

    it('adds details for tickers detected elsewhere', () => {
        assert.deepEqual(detectCompanies('Shares jumped today', ['TSLA']).map((c) => c.ticker), ['TSLA']);
    });

    it('ignores lowercase and ambiguous words', () => {
        assert.deepEqual(detectCompanies('apple orchards hit by frost; target price raised; visa rules change'), []);
        assert.deepEqual(detectCompanies('Analysts lift Target price on chip stocks'), []);
    });

    it('matches names containing ampersands and Indian companies', () => {
        const tickers = detectCompanies('AT&T and Larsen & Toubro report results; Infosys gains').map((c) => c.ticker);
        assert.deepEqual(tickers.sort(), ['INFY.NS', 'LT.NS', 'T']);
    });
});

describe('classifyEvents', () => {
    it('detects earnings, guidance, and analyst actions', () => {
        const events = classifyEvents('Nvidia beats estimates, raises its outlook; Morgan Stanley lifts price target');
        assert.ok(events.includes('earnings'));
        assert.ok(events.includes('guidance'));
        assert.ok(events.includes('analyst_rating'));
    });

    it('does not treat "stocks to buy" as an acquisition or "fed up" as macro', () => {
        assert.deepEqual(classifyEvents('3 stocks to buy now if you are fed up with volatility'), []);
    });

    it('detects macro news from the Fed', () => {
        assert.deepEqual(classifyEvents('Fed signals rate cut as inflation cools'), ['macro']);
    });
});

describe('scoreSentiment', () => {
    it('scores positive, negative, and neutral headlines', () => {
        assert.equal(scoreSentiment('Shares soar after earnings beat; stock hits record high').label, 'positive');
        assert.equal(scoreSentiment('Stock plunges after company misses estimates and warns').label, 'negative');
        assert.deepEqual(scoreSentiment('Company to hold annual meeting on Tuesday'), { score: 0, label: 'neutral' });
    });

    it('keeps the score between -1 and 1', () => {
        const { score } = scoreSentiment('falls falls falls falls');
        assert.equal(score, -1);
    });

    it('weights the headline over a noisy summary', () => {
        const result = scoreSentiment(
            'Tesla China-Made EV Sales Rise 5% in September, Extending Growth Streak',
            'Sales fell in August amid concerns about competition.',
        );
        assert.equal(result.label, 'positive');
    });

    it('flips polarity after a nearby negation', () => {
        assert.equal(scoreSentiment('SpaceX’s Terafab Probably Won’t Deliver Very High Profits').label, 'negative');
        assert.equal(scoreSentiment('Shares did not fall despite the selloff fears').score > -1, true);
    });
});
