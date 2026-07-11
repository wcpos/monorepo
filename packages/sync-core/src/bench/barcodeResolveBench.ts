/**
 * Barcode-resolve BENCH INSTRUMENT (docs/wcpos-pain-points.md §3): the
 * scenario runner, the wc/v3 local-hit target prefetch, profile parsing,
 * min/median/max summaries and the markdown report. The ENGINE it measures
 * (buildLocalBarcodeIndex + resolveScan) lives in ../barcodeResolve and is
 * consumed here strictly through its public surface — deleting this bench
 * directory must never break the scan flow.
 */

import {
  buildLocalBarcodeIndex,
  barcodeResolveProfiles,
  resolveScan,
  type BarcodeIndexEntry,
  type BarcodeResolveFetcher,
  type BarcodeResolveProfile,
  type ScanEventType,
  type ScanResult,
} from '../barcodeResolve';

/** Contract budget for a miss resolving online (report-only). */
export const RESOLUTION_BUDGET_MS = 10_000;
/** "Effectively instant" feedback threshold — feedback is synchronous, so
 * anything above this means the flow awaited before talking to the cashier. */
export const LOCAL_FEEDBACK_BUDGET_MS = 50;
/** Known variation SKU on the target store (woo sample data). */
export const ONLINE_VARIATION_SKU = 'woo-vneck-tee-blue';
export const DEFAULT_BENCH_RUNS = 5;

export function parseBarcodeResolveProfiles(value: string): BarcodeResolveProfile[] {
  const profiles = value
    .split(',')
    .map((profile) => profile.trim())
    .filter(Boolean);
  if (profiles.length === 0) {
    throw new Error(`BR_PROFILES must include at least one profile. Known profiles: ${barcodeResolveProfiles.join(', ')}`);
  }
  const unknown = profiles.filter(
    (profile) => !barcodeResolveProfiles.includes(profile as BarcodeResolveProfile),
  );
  if (unknown.length > 0) {
    throw new Error(`BR_PROFILES contains unknown profile(s): ${unknown.join(', ')}. Known profiles: ${barcodeResolveProfiles.join(', ')}`);
  }
  return profiles as BarcodeResolveProfile[];
}

export type MsSummary = { minMs: number; medianMs: number; maxMs: number };

export function summarizeMs(values: number[]): MsSummary {
  if (values.length === 0) {
    return { minMs: 0, medianMs: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { minMs: sorted[0], medianMs, maxMs: sorted[sorted.length - 1] };
}

export type BarcodeResolveScenarioId = 'local-hit' | 'online-variation' | 'not-found';

export type BarcodeScenarioRun = {
  run: number;
  outcome: ScanResult['outcome'];
  scanToFeedbackMs: number;
  scanToResolutionMs: number;
  /**
   * true: searching-online was observed before the first fetch call.
   * false: a fetch happened without (or before) the feedback event — the bug.
   * null: the run never went near the network (local hit path).
   */
  feedbackBeforeNetwork: boolean | null;
  fetchCalls: number;
  events: ScanEventType[];
  passed: boolean;
  note: string;
};

export type BarcodeScenarioReport = {
  scenarioId: BarcodeResolveScenarioId;
  profile: BarcodeResolveProfile;
  code: string;
  expectedOutcome: 'local' | 'online' | 'not-found';
  runs: BarcodeScenarioRun[];
  resolutionStats: MsSummary;
  /** Every run produced the expected outcome and scenario assertions held. */
  passed: boolean;
  /** Every networked run emitted searching-online before its first fetch. */
  orderingHeld: boolean;
};

export type BarcodeResolveVerdict = { assertion: string; pass: boolean; evidence: string };

export type BarcodeBudgetCell = {
  profile: BarcodeResolveProfile;
  scenarioId: BarcodeResolveScenarioId;
  medianResolutionMs: number;
  withinBudget: boolean;
};

export type BarcodeResolveBenchResult = {
  runId: string;
  runstamp: string;
  startedAtIso: string;
  endedAtIso: string;
  syncBaseUrl: string;
  wooBaseUrl: string;
  profiles: BarcodeResolveProfile[];
  runsPerScenario: number;
  budgetMs: number;
  localHitTarget: { productId: number; sku: string } | null;
  scenarios: BarcodeScenarioReport[];
  budgetReport: BarcodeBudgetCell[];
  verdicts: BarcodeResolveVerdict[];
  allPassed: boolean;
  error?: string;
};

export type BarcodeResolveBenchInput = {
  syncBaseUrl: string;
  wooBaseUrl: string;
  fetcher?: BarcodeResolveFetcher;
  /** Millisecond clock for timings (default performance.now). */
  now?: () => number;
  /** Wall clock for run id / ISO stamps (default real Date). */
  wallNow?: () => Date;
  profiles?: BarcodeResolveProfile[];
  runsPerScenario?: number;
  runstamp?: string;
};

type BenchContext = {
  syncBaseUrl: string;
  wooBaseUrl: string;
  fetcher: BarcodeResolveFetcher;
  now: () => number;
};

type ScenarioPlan = {
  id: BarcodeResolveScenarioId;
  code: string;
  index: Map<string, BarcodeIndexEntry>;
  expectedOutcome: 'local' | 'online' | 'not-found';
};

/**
 * Scenario (a) target: first product on the store with a non-empty sku via
 * wc/v3, indexed as if it were already synced locally. Also reused by the
 * playground hosts (packages/playground-host) to prime their local-hit demo.
 */
export async function prefetchLocalHitTarget(ctx: BenchContext): Promise<{
  productId: number;
  sku: string;
  index: Map<string, BarcodeIndexEntry>;
}> {
  // Seeded lab catalogs front-load hundreds of SKU-less products, so page
  // until a SKU-bearing one turns up rather than trusting the first page.
  let target: { id: number; sku?: string } | undefined;
  for (let page = 1; page <= 5 && !target; page += 1) {
    const url = `${ctx.wooBaseUrl.replace(/\/$/, '')}/products?per_page=100&page=${page}&orderby=id&order=asc&_fields=id,sku`;
    const response = await ctx.fetcher(url);
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`wc/v3 GET /products failed: ${response.status} ${body.slice(0, 200)}`);
    }
    const products = JSON.parse(body) as Array<{ id: number; sku?: string }>;
    if (products.length === 0) break;
    target = products.find((product) => typeof product.sku === 'string' && product.sku.trim() !== '');
  }
  if (!target || typeof target.sku !== 'string') {
    throw new Error('barcode-resolve bench needs one product with a non-empty sku in the first 500 wc/v3 products');
  }
  const sku = target.sku.trim();
  const { index } = buildLocalBarcodeIndex([
    { id: `woo-product:${target.id}`, payload: { sku } },
  ]);
  return { productId: target.id, sku, index };
}

function checkRun(input: {
  plan: ScenarioPlan;
  result: ScanResult;
  fetchCalls: number;
}): { passed: boolean; note: string } {
  const { plan, result, fetchCalls } = input;
  const problems: string[] = [];
  if (result.outcome !== plan.expectedOutcome) {
    problems.push(`expected outcome ${plan.expectedOutcome}, got ${result.outcome}`);
  }
  if (result.timings.scanToFeedbackMs > LOCAL_FEEDBACK_BUDGET_MS) {
    problems.push(`feedback took ${result.timings.scanToFeedbackMs.toFixed(1)}ms (> ${LOCAL_FEEDBACK_BUDGET_MS}ms)`);
  }
  if (plan.expectedOutcome === 'local' && fetchCalls > 0) {
    problems.push(`local hit still made ${fetchCalls} network call(s)`);
  }
  if (plan.id === 'online-variation' && result.outcome === 'online') {
    if (result.match.type !== 'variation') {
      problems.push(`expected match.type variation, got ${result.match.type}`);
    }
    if (!((result.match.parent_id ?? 0) > 0)) {
      problems.push(`expected match.parent_id > 0, got ${String(result.match.parent_id)}`);
    }
  }
  if (result.outcome === 'error') {
    problems.push(result.message);
  }
  const note =
    problems.length > 0
      ? problems.join('; ')
      : result.outcome === 'online'
        ? `match ${result.match.id} (${result.match.type}, parent ${result.match.parent_id ?? 0})`
        : result.outcome === 'local'
          ? `doc ${result.docId}`
          : 'ok';
  return { passed: problems.length === 0, note };
}

async function runScenarioOnce(
  ctx: BenchContext,
  plan: ScenarioPlan,
  profile: BarcodeResolveProfile,
  run: number,
): Promise<BarcodeScenarioRun> {
  // Shared order log: event emissions and fetch invocations interleave here,
  // so "feedback precedes network" is an observable fact, not an inference.
  const order: string[] = [];
  let fetchCalls = 0;
  const loggingFetcher: BarcodeResolveFetcher = (url, init) => {
    fetchCalls += 1;
    order.push('fetch');
    return ctx.fetcher(url, init);
  };
  const events: ScanEventType[] = [];
  const result = await resolveScan({
    code: plan.code,
    index: plan.index,
    syncBaseUrl: ctx.syncBaseUrl,
    fetcher: loggingFetcher,
    now: ctx.now,
    profile,
    onEvent: (event) => {
      order.push(`event:${event.type}`);
      events.push(event.type);
    },
  });

  const searchingIndex = order.indexOf('event:searching-online');
  const fetchIndex = order.indexOf('fetch');
  const feedbackBeforeNetwork =
    fetchIndex === -1
      ? searchingIndex === -1
        ? null
        : true
      : searchingIndex !== -1 && searchingIndex < fetchIndex;

  const { passed, note } = checkRun({ plan, result, fetchCalls });
  return {
    run,
    outcome: result.outcome,
    scanToFeedbackMs: result.timings.scanToFeedbackMs,
    scanToResolutionMs: result.timings.scanToResolutionMs,
    feedbackBeforeNetwork,
    fetchCalls,
    events,
    passed,
    note,
  };
}

export async function runBarcodeResolveBench(input: BarcodeResolveBenchInput): Promise<BarcodeResolveBenchResult> {
  const fetcher = input.fetcher ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const now = input.now ?? (() => performance.now());
  const wallNow = input.wallNow ?? (() => new Date());
  const profiles = input.profiles && input.profiles.length > 0 ? input.profiles : ['good-local' as const];
  const runsPerScenario = input.runsPerScenario ?? DEFAULT_BENCH_RUNS;
  const runstamp = input.runstamp ?? wallNow().toISOString().replace(/[:.]/g, '-');
  const startedAtIso = wallNow().toISOString();
  const ctx: BenchContext = { syncBaseUrl: input.syncBaseUrl, wooBaseUrl: input.wooBaseUrl, fetcher, now };

  const scenarios: BarcodeScenarioReport[] = [];
  let localHitTarget: { productId: number; sku: string } | null = null;
  let error: string | undefined;

  try {
    const prefetched = await prefetchLocalHitTarget(ctx);
    localHitTarget = { productId: prefetched.productId, sku: prefetched.sku };
    const emptyIndex = new Map<string, BarcodeIndexEntry>();
    const plans: ScenarioPlan[] = [
      { id: 'local-hit', code: prefetched.sku, index: prefetched.index, expectedOutcome: 'local' },
      { id: 'online-variation', code: ONLINE_VARIATION_SKU, index: emptyIndex, expectedOutcome: 'online' },
      { id: 'not-found', code: `no-such-barcode-${runstamp}`, index: emptyIndex, expectedOutcome: 'not-found' },
    ];

    for (const profile of profiles) {
      for (const plan of plans) {
        const runs: BarcodeScenarioRun[] = [];
        for (let run = 1; run <= runsPerScenario; run += 1) {
          runs.push(await runScenarioOnce(ctx, plan, profile, run));
        }
        scenarios.push({
          scenarioId: plan.id,
          profile,
          code: plan.code,
          expectedOutcome: plan.expectedOutcome,
          runs,
          resolutionStats: summarizeMs(runs.map((record) => record.scanToResolutionMs)),
          passed: runs.every((record) => record.passed),
          orderingHeld: runs.every((record) => record.feedbackBeforeNetwork !== false),
        });
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const budgetReport: BarcodeBudgetCell[] = scenarios.map((report) => ({
    profile: report.profile,
    scenarioId: report.scenarioId,
    medianResolutionMs: report.resolutionStats.medianMs,
    withinBudget: report.resolutionStats.medianMs <= RESOLUTION_BUDGET_MS,
  }));

  const verdicts: BarcodeResolveVerdict[] = [];

  const missReports = scenarios.filter((report) => report.expectedOutcome !== 'local');
  const orderingBroken = missReports.filter((report) => !report.orderingHeld);
  verdicts.push({
    assertion: 'feedback precedes network on every local miss (searching-online before the first fetch)',
    pass: scenarios.length > 0 && orderingBroken.length === 0,
    evidence:
      scenarios.length === 0
        ? 'no scenarios ran'
        : orderingBroken.length === 0
          ? `${missReports.reduce((total, report) => total + report.runs.length, 0)} miss runs, all emitted searching-online before fetch`
          : orderingBroken.map((report) => `${report.scenarioId}@${report.profile} broke ordering`).join('; '),
  });

  const failedReports = scenarios.filter((report) => !report.passed);
  verdicts.push({
    assertion: 'scenario outcomes match expectations (local / online variation with parent_id / not-found, instant feedback)',
    pass: scenarios.length > 0 && failedReports.length === 0,
    evidence:
      scenarios.length === 0
        ? 'no scenarios ran'
        : failedReports.length === 0
          ? scenarios.map((report) => `${report.scenarioId}@${report.profile}: ${report.runs.length}/${report.runs.length} ok`).join('; ')
          : failedReports
              .map((report) => {
                const firstProblem = report.runs.find((record) => !record.passed);
                return `${report.scenarioId}@${report.profile}: ${firstProblem?.note ?? 'failed'}`;
              })
              .join('; '),
  });

  // Report-only: the 10s budget never fails the run by itself (slow profiles
  // are expected to be slow); silence/ordering and wrong outcomes do.
  verdicts.push({
    assertion: `median scan-to-resolution reported against the ${RESOLUTION_BUDGET_MS}ms budget (report-only, never fails the run)`,
    pass: true,
    evidence:
      budgetReport.length === 0
        ? 'no scenarios ran'
        : budgetReport
            .map((cell) => `${cell.scenarioId}@${cell.profile}: ${Math.round(cell.medianResolutionMs)}ms ${cell.withinBudget ? 'within' : 'OVER'} budget`)
            .join('; '),
  });

  if (error !== undefined) {
    verdicts.push({ assertion: 'bench ran to completion', pass: false, evidence: error });
  }

  return {
    runId: `barcode-resolve-${runstamp}`,
    runstamp,
    startedAtIso,
    endedAtIso: wallNow().toISOString(),
    syncBaseUrl: input.syncBaseUrl,
    wooBaseUrl: input.wooBaseUrl,
    profiles,
    runsPerScenario,
    budgetMs: RESOLUTION_BUDGET_MS,
    localHitTarget,
    scenarios,
    budgetReport,
    verdicts,
    allPassed: verdicts.length > 0 && verdicts.every((verdict) => verdict.pass),
    ...(error === undefined ? {} : { error }),
  };
}

// --- Markdown summary ---------------------------------------------------------------------

export function renderBarcodeResolveMarkdown(result: BarcodeResolveBenchResult): string {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const formatMs = (value: number) => `${Math.round(value * 10) / 10}ms`;
  const lines = [
    `## Barcode resolve — ${result.runId}`,
    '',
    `Profiles: ${result.profiles.join(', ')}; ${result.runsPerScenario} runs per scenario; budget ${result.budgetMs}ms.`,
    result.localHitTarget
      ? `Local-hit target: product ${result.localHitTarget.productId} (sku ${result.localHitTarget.sku}).`
      : 'Local-hit target: unavailable.',
    '',
    '| scenario | profile | expected | feedback ms (max) | resolution ms min/median/max | budget | ordering | runs |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...result.scenarios.map((report) => {
      const feedbackMax = Math.max(...report.runs.map((record) => record.scanToFeedbackMs));
      const stats = report.resolutionStats;
      const withinBudget = stats.medianMs <= result.budgetMs;
      return [
        '',
        report.scenarioId,
        report.profile,
        report.expectedOutcome,
        formatMs(feedbackMax),
        `${formatMs(stats.minMs)} / ${formatMs(stats.medianMs)} / ${formatMs(stats.maxMs)}`,
        withinBudget ? 'within' : 'OVER',
        report.orderingHeld ? 'ok' : 'BROKEN',
        `${report.runs.filter((record) => record.passed).length}/${report.runs.length} ${report.passed ? 'PASS' : 'FAIL'}`,
        '',
      ].join(' | ').trim();
    }),
    '',
    '| assertion | verdict | evidence |',
    '| --- | --- | --- |',
    ...result.verdicts.map((verdict) =>
      `| ${escape(verdict.assertion)} | ${verdict.pass ? 'PASS' : 'FAIL'} | ${escape(verdict.evidence)} |`),
    '',
    result.allPassed ? 'ALL PASS' : 'FAILURES PRESENT',
  ];
  return lines.join('\n');
}
