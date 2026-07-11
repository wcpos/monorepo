import { describe, expect, it } from 'vitest';
import { type BarcodeResolveFetcher, type ResolveBarcodeResponse } from '../barcodeResolve';
import {
  ONLINE_VARIATION_SKU,
  parseBarcodeResolveProfiles,
  prefetchLocalHitTarget,
  renderBarcodeResolveMarkdown,
  runBarcodeResolveBench,
  summarizeMs,
} from './barcodeResolveBench';

const SYNC_BASE_URL = 'http://wcpos.local/wp-json/wc-rxdb-sync/v1';
const WOO_BASE_URL = 'http://wcpos.local/wp-json/wc/v3';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function resolveResponse(partial: Partial<ResolveBarcodeResponse> = {}): ResolveBarcodeResponse {
  return {
    code: 'x',
    found: false,
    match: null,
    ambiguous: [],
    meta: { duration_ms: 5, server_profile: 'good-local', candidates: 0 },
    ...partial,
  };
}

function createFakeClock(startMs = 0) {
  let currentMs = startMs;
  return {
    now: () => currentMs,
    advance: (ms: number) => {
      currentMs += ms;
    },
  };
}

describe('bench helpers', () => {
  it('summarizeMs reports min/median/max for odd and even counts', () => {
    expect(summarizeMs([5, 1, 3])).toEqual({ minMs: 1, medianMs: 3, maxMs: 5 });
    expect(summarizeMs([4, 1, 3, 2])).toEqual({ minMs: 1, medianMs: 2.5, maxMs: 4 });
    expect(summarizeMs([])).toEqual({ minMs: 0, medianMs: 0, maxMs: 0 });
  });

  it('parseBarcodeResolveProfiles validates against the known profile list', () => {
    expect(parseBarcodeResolveProfiles('good-local')).toEqual(['good-local']);
    expect(parseBarcodeResolveProfiles(' slow-php , slow-db ')).toEqual(['slow-php', 'slow-db']);
    expect(() => parseBarcodeResolveProfiles('')).toThrow(/BR_PROFILES/);
    expect(() => parseBarcodeResolveProfiles('warp-speed')).toThrow(/warp-speed/);
  });
});

// --- Bench runner (mocked store) ------------------------------------------------------

function benchFetcher(input: {
  variationFound?: boolean;
  clock?: ReturnType<typeof createFakeClock>;
  resolveDelayMs?: number;
}): BarcodeResolveFetcher {
  return async (url) => {
    input.clock?.advance(input.resolveDelayMs ?? 10);
    const parsed = new URL(url);
    if (parsed.pathname.includes('/wc/v3/products')) {
      return jsonResponse([
        { id: 41, sku: '' },
        { id: 42, sku: 'LOCAL-SKU' },
      ]);
    }
    if (parsed.pathname.endsWith('/resolve/barcode')) {
      const code = parsed.searchParams.get('code') ?? '';
      if (code === ONLINE_VARIATION_SKU && input.variationFound !== false) {
        return jsonResponse(
          resolveResponse({
            code,
            found: true,
            match: { id: 99, type: 'variation', parent_id: 77, payload: { id: 99 } },
            meta: { duration_ms: 4, server_profile: 'good-local', candidates: 1 },
          }),
        );
      }
      return jsonResponse(resolveResponse({ code }));
    }
    throw new Error(`unexpected url in bench test: ${url}`);
  };
}

describe('runBarcodeResolveBench', () => {
  it('runs all three scenarios per profile and passes on a healthy store', async () => {
    const clock = createFakeClock();
    const result = await runBarcodeResolveBench({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher: benchFetcher({ clock }),
      now: clock.now,
      wallNow: () => new Date('2026-06-10T00:00:00.000Z'),
      profiles: ['good-local', 'slow-db'],
      runsPerScenario: 2,
      runstamp: 'test-stamp',
    });

    expect(result.runId).toBe('barcode-resolve-test-stamp');
    expect(result.localHitTarget).toEqual({ productId: 42, sku: 'LOCAL-SKU' });
    expect(result.scenarios).toHaveLength(6); // 3 scenarios x 2 profiles
    expect(result.scenarios.map((scenario) => scenario.scenarioId)).toEqual([
      'local-hit', 'online-variation', 'not-found',
      'local-hit', 'online-variation', 'not-found',
    ]);
    for (const scenario of result.scenarios) {
      expect(scenario.passed).toBe(true);
      expect(scenario.orderingHeld).toBe(true);
      expect(scenario.runs).toHaveLength(2);
    }
    const localHit = result.scenarios.find((scenario) => scenario.scenarioId === 'local-hit');
    expect(localHit?.runs.every((run) => run.fetchCalls === 0)).toBe(true);
    expect(result.budgetReport.every((cell) => cell.withinBudget)).toBe(true);
    expect(result.verdicts).toHaveLength(3);
    expect(result.allPassed).toBe(true);
  });

  it('fails the outcomes verdict when the store cannot resolve the known variation', async () => {
    const result = await runBarcodeResolveBench({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher: benchFetcher({ variationFound: false }),
      now: createFakeClock().now,
      wallNow: () => new Date('2026-06-10T00:00:00.000Z'),
      profiles: ['good-local'],
      runsPerScenario: 1,
      runstamp: 'test-stamp',
    });
    const outcomesVerdict = result.verdicts.find((verdict) => verdict.assertion.includes('outcomes match'));
    expect(outcomesVerdict?.pass).toBe(false);
    expect(outcomesVerdict?.evidence).toContain('online-variation');
    expect(result.allPassed).toBe(false);
  });

  it('reports the budget verdict as report-only even when the median exceeds 10s', async () => {
    const clock = createFakeClock();
    const result = await runBarcodeResolveBench({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher: benchFetcher({ clock, resolveDelayMs: 12_000 }),
      now: clock.now,
      wallNow: () => new Date('2026-06-10T00:00:00.000Z'),
      profiles: ['good-local'],
      runsPerScenario: 1,
      runstamp: 'test-stamp',
    });
    const budgetVerdict = result.verdicts.find((verdict) => verdict.assertion.includes('budget'));
    expect(budgetVerdict?.pass).toBe(true);
    expect(budgetVerdict?.evidence).toContain('OVER');
    expect(result.budgetReport.some((cell) => !cell.withinBudget)).toBe(true);
    // Slow but correct + feedback-first: the run still passes.
    expect(result.allPassed).toBe(true);
  });

  it('records a completion failure verdict when the prefetch fails', async () => {
    const fetcher: BarcodeResolveFetcher = async () => new Response('nope', { status: 403 });
    const result = await runBarcodeResolveBench({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher,
      now: createFakeClock().now,
      wallNow: () => new Date('2026-06-10T00:00:00.000Z'),
      runstamp: 'test-stamp',
    });
    expect(result.error).toContain('403');
    expect(result.allPassed).toBe(false);
    expect(result.verdicts.at(-1)).toMatchObject({ assertion: 'bench ran to completion', pass: false });
  });

  it('prefetchLocalHitTarget picks the first product with a non-empty sku', async () => {
    const target = await prefetchLocalHitTarget({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher: benchFetcher({}),
      now: () => 0,
    });
    expect(target.productId).toBe(42);
    expect(target.sku).toBe('LOCAL-SKU');
    expect(target.index.get('LOCAL-SKU')).toEqual({ docId: 'woo-product:42' });
  });

  it('renders a markdown summary with scenario and verdict tables', async () => {
    const clock = createFakeClock();
    const result = await runBarcodeResolveBench({
      syncBaseUrl: SYNC_BASE_URL,
      wooBaseUrl: WOO_BASE_URL,
      fetcher: benchFetcher({ clock }),
      now: clock.now,
      wallNow: () => new Date('2026-06-10T00:00:00.000Z'),
      profiles: ['good-local'],
      runsPerScenario: 1,
      runstamp: 'test-stamp',
    });
    const markdown = renderBarcodeResolveMarkdown(result);
    expect(markdown).toContain('## Barcode resolve — barcode-resolve-test-stamp');
    expect(markdown).toContain('| scenario | profile |');
    expect(markdown).toContain('| assertion | verdict | evidence |');
    expect(markdown).toContain('ALL PASS');
  });
});
