/**
 * Hybrid change-signal engine — the composition the change-signal matrix
 * nominated (docs/experiments/change-signal-matrix-2026-06-10.md, "Emerging
 * hybrid hypothesis"). It graduates the playground's measured tiers into a
 * sync-core module behind a clean port, the same move scopeGuardedPull made.
 *
 * The engine does NOT re-implement endpoint plumbing — that lives in the bench
 * instrument (apps/web/src/bench/changeSignalMatrix.ts), which MEASURED the
 * candidates. The engine COMPOSES the tiers the matrix ranked:
 *
 *   TIER 1 — sequence-log: the routine signal on every poll. Hook-fed cursor,
 *            carries ALL hooked changes (products, variations, tax rates,
 *            deletes as tombstones). O(changes), flat 137–367ms at 10k. The
 *            only thing it cannot see is a hook-BYPASSING write.
 *   TIER 2 — periodic integrity backstop for the hook-bypass hole. Two
 *            detectors because the id-spaces differ:
 *              - hash-checksum over wp_posts (products/variations): closes the
 *                sql-bypass hole at GROUP-BY prices, 451ms at 10k where every
 *                other candidate MISSES.
 *              - range-checksum over tax_rates: tax rates live OUTSIDE the
 *                wp_posts id space hash-checksum buckets, ~360ms.
 *   TIER 3 — drill-down resolves WHICH ids drifted in a flagged bucket
 *            (targeted, ~2ms/bucket); revision-hash is the deepest repair,
 *            on-demand ONLY (112–142s at 10k disqualifies it as a poll).
 *
 * Pure module: no rxdb, no fetch, no DOM. The host platform supplies the port
 * (it owns the PHP plugin's detection endpoints); the engine only consumes the
 * injected source + now(). Row types are defined HERE so the bench can later
 * import FROM sync-core, never the reverse (ADR direction: engine is upstream).
 *
 * OPTIONAL TIER (ADR 0006) — representation-config fingerprint. A separate,
 * self-contained signal (configChangeSignal.ts) is COMPOSED in only when the
 * host supplies a `configSource`. It catches Scenario 1 (a global setting flips
 * the served representation of many records with no record change), the gap the
 * three tiers above are structurally blind to. Surfacing `staleCollections` on
 * the SAME poll() outcome means a stale collection flows through the existing
 * re-fetch path instead of a parallel one the host must remember to call. The
 * config baseline is committed only at poll success (alongside the TIER 1
 * cursor), so a later failure cannot strand a settings-change signal. When no
 * `configSource` is given the tier is absent and behavior is byte-for-byte
 * unchanged (the new fields are simply omitted).
 */

import {
  createConfigChangeSignal,
  type ConfigChangeSignal,
  type ConfigFingerprintChange,
  type ConfigFingerprintBaseline,
  type ConfigFingerprintSource,
} from './configChangeSignal';

// --- Shared row types (the engine owns these; the bench may import them) ------

export type HybridCollection =
  | 'products'
  | 'variations'
  | 'tax_rates'
  | 'customers'
  | 'coupons'
  | 'categories'
  | 'brands'
  | 'tags';

/**
 * The small pull-only GREEDY reference collections. They share ONE apply shape: any
 * change (create/update/delete) reconciles through a single re-pull of their
 * `<collection>:all` lane, whose prunable greedy fetcher upserts current rows AND
 * set-difference-prunes a deleted one — so no per-id pull and no separate delete arm
 * (the mirror of tax_rates, but prunable). Coupons + the three WC product taxonomies
 * (categories/brands/tags, all WP terms) all qualify.
 */
export type ReferenceCollection = 'coupons' | 'categories' | 'brands' | 'tags';

/** The reference collections in a stable apply order. */
export const REFERENCE_COLLECTIONS: readonly ReferenceCollection[] = [
  'categories',
  'brands',
  'tags',
  'coupons',
];

/**
 * The collections that carry a barcode representation-config fingerprint (ADR 0006).
 * DISTINCT from `HybridCollection` on purpose: change-detection may cover MORE
 * collections than the config-fingerprint tier does. Customers, for example, are
 * change-detected (sequence-log) but have NO barcode config — so widening
 * `HybridCollection` for change-detection must not force them into the per-collection
 * barcode records (`Record<BarcodeConfigCollection, ...>`). Identical to
 * `HybridCollection` today; the two diverge the moment `HybridCollection` widens.
 */
export type BarcodeConfigCollection = 'products' | 'variations' | 'tax_rates';

/**
 * One row from the hook-fed change log (TIER 1). Mirrors the bench's
 * SequenceLogRow: a global `sequence` cursor, the object `id`, the change
 * `type` (hooked deletes/trashes arrive as explicit tombstone rows, NOT
 * absences), and an optional `modified_gmt` (tax rates carry none).
 *
 * `collection` is REQUIRED and is the row's single source of truth for "which
 * collection changed". The server tags every unified-stream row (its internal
 * `object_type` → collection, class-changes-controller.php) and the source
 * adapter maps that wire field to `collection` at the boundary
 * (apps/web/src/bench/hybridEngineLiveSource.ts), dropping rows whose
 * collection is absent or unknown — so the engine never guesses.
 */
export type SequenceLogRow = {
  sequence: number;
  id: number;
  collection: HybridCollection;
  type: string;
  modified_gmt?: string;
};

/**
 * One bucket from the hash-checksum integrity scan (TIER 2, products). Mirrors
 * the bench's HashChecksumBucketRow. A bucket is a mismatch when `match` is
 * false (stored BIT_XOR digest / count differs from current) — i.e. content
 * changed without a hook firing.
 */
export type HashChecksumBucket = {
  bucket: number;
  range: { start: number; end: number };
  stored_count: number;
  current_count: number;
  // 64-bit digests (ADR 0014 M1) exceed JS Number's 2^53 safe range, so they are carried as STRINGS.
  // The hash-checksum path decides on the server's absolute `match` verdict, never a client digest
  // compare (a cross-sweep digest diff was removed as unsound — see below), so these are diagnostic.
  stored_digest: string;
  current_digest: string;
  match: boolean;
};

/**
 * One bucket from the range-checksum scan (TIER 2, tax rates). The tax-rate
 * checksum CONCAT covers the full rate row, so any edit moves it; `record_count`
 * moves on add/delete.
 */
export type RangeChecksumBucket = {
  bucket: number;
  record_count: number;
  checksum: string;
  ids?: number[];
};

/**
 * A drifted id resolved by a TIER 3 drill-down into a flagged bucket. `status`
 * distinguishes the hook-bypass cases the drill-down endpoint reports:
 * - 'changed'        — a stored digest whose row's content no longer matches
 * - 'deleted'        — a stored digest whose row is gone (bypassing delete)
 * - 'missing_stored' — a live row with no stored digest (bypassing CREATE — a
 *   row inserted without firing the hook, so it was never digested)
 * The engine only needs the `id`; the status is carried for the host/diagnostics.
 */
export type DriftedId = {
  id: number;
  status: 'changed' | 'deleted' | 'missing_stored';
  /**
   * The collection this id belongs to, when the drill-down can tell. The
   * hash-checksum id-space (wp_posts) holds BOTH products and variations, so a
   * drifted hash-checksum id is NOT necessarily a product — the server's
   * drill-down knows the post_type and should report it here so the host pulls
   * the right path. When omitted, the engine falls back to the detector's
   * default collection (hash-checksum → products, range-checksum → tax_rates).
   */
  collection?: HybridCollection;
};

// --- The cursor the host advances (opaque-ish; the engine only compares) ------

/**
 * The TIER 1 cursor. The host decides its concrete shape (the bench uses a
 * single integer `sequence`); the engine treats it as an opaque token it
 * threads from poll to poll and never interprets beyond passing it back. Kept
 * as `unknown`-friendly via a structural alias so any host cursor fits.
 */
export type SequenceCursor = { sequence: number };

// --- The PORT the host implements --------------------------------------------

/**
 * The detection surface the host platform supplies — an abstraction over the
 * PHP plugin's `/changes/sequence-log`, `/integrity/scan`,
 * `/changes/range-checksum`, and the drill-downs. The engine depends ONLY on
 * this; it never knows about fetch, URLs, or envelopes.
 */
export type ChangeSignalSource = {
  /**
   * TIER 1 — routine signal, every poll. Drains the hook-fed sequence-log from
   * the cursor. Carries ALL hooked changes (products, variations, tax rates,
   * deletes as tombstones). The returned cursor is the new high-water mark;
   * `hasMore` is true when the page was capped and another drain is needed.
   */
  pollSequenceLog(input: {
    cursor: SequenceCursor;
    limit: number;
  }): Promise<{ rows: SequenceLogRow[]; cursor: SequenceCursor; hasMore: boolean }>;

  /**
   * TIER 2 — products. Paginated BIT_XOR-aggregate scan over wp_posts id
   * buckets. Catches hook-BYPASSING writes (sql-bypass) that TIER 1 is blind
   * to. Paginate `afterId` until `complete`.
   */
  hashChecksumScan(input: {
    bucketSize: number;
    afterId: number;
    limitBuckets: number;
  }): Promise<{ buckets: HashChecksumBucket[]; complete: boolean; nextAfterId: number }>;

  /**
   * TIER 2 — tax rates. They live OUTSIDE the wp_posts id space hash-checksum
   * buckets, so they get their own integrity tool. Single GROUP BY, no
   * pagination in evidence (the tax-rate table is tiny).
   */
  rangeChecksumScan(input: {
    collection: 'tax_rates' | 'products';
    /**
     * The bucket size the scan must use, so its `bucket` numbers and the later
     * `drillDownBucket` (called with the SAME policy size) agree on the id
     * range. Without this the host could bucket by a different default and the
     * drill-down would target the wrong rates or return nothing.
     */
    bucketSize: number;
  }): Promise<{ buckets: RangeChecksumBucket[] }>;

  /**
   * TIER 3 — resolve which ids drifted in a single flagged bucket (targeted).
   * `detector` selects the id-space: hash-checksum buckets are over wp_posts
   * product ids, range-checksum buckets are over the tax-rate id space — and
   * for common buckets like {size:1000, bucket:0} the (size, bucket) pair is
   * identical between the two, so without `detector` the host cannot tell a
   * product drill-down from a tax-rate one (codex review P1). `bucketSize` is
   * echoed so the host can re-derive the id range.
   */
  drillDownBucket(input: {
    detector: IntegrityMismatch['detector'];
    collection: HybridCollection;
    bucketSize: number;
    bucket: number;
  }): Promise<{ driftedIds: DriftedId[] }>;

  /**
   * TIER 3 — the deepest repair signal, on-demand ONLY. NEVER polled
   * (112–142s at 10k disqualifies it). Recomputes each id's served
   * representation hash; the engine only reaches here when a bucket stays
   * mismatched after targeted pulls (a real divergence the pull is not
   * fixing). Optional: a host without a repair endpoint omits it and the
   * engine simply does not escalate.
   */
  revisionHashForIds?(input: {
    ids: number[];
    collection: HybridCollection;
    detector: IntegrityMismatch['detector'];
  }): Promise<{ rows: Array<{ id: number; revision: string }> }>;
};

// --- Policy (fully injectable; defaults tied to the matrix evidence) ----------

export type HybridChangeSignalPolicy = {
  /**
   * TIER 1 page size for the sequence-log drain. The bench's DEFAULT_PAGE_LIMIT
   * is 100; the engine keeps that — flat O(changes) cost means a 100-row page
   * stays sub-second even on slow-db.
   */
  sequenceLogLimit: number;
  /**
   * TIER 1 safety cap: the maximum number of sequence-log pages a single
   * poll() will drain before stopping (a runaway backlog or a host that never
   * sets hasMore=false must not spin forever). The drain stops and reports the
   * cursor it reached; the next poll() resumes from there.
   */
  maxSequenceLogPages: number;
  /**
   * TIER 2 cadence by poll count: run the integrity sweep every Nth poll(). The
   * routine TIER 1 poll is cheap and frequent; the integrity sweep is the
   * "periodic" backstop the matrix prescribes, so it runs far less often.
   */
  sweepEveryNPolls: number;
  /**
   * TIER 2 cadence by wall-clock: also sweep when this many ms have elapsed
   * since the last sweep (whichever cadence fires first). Lets a host poll
   * irregularly and still get a time-bounded integrity guarantee. 0 disables
   * the time cadence (count cadence only).
   */
  sweepIntervalMs: number;
  /**
   * TIER 2 hash-checksum pagination page size (buckets per request). Matches
   * the bench's HASH_CHECKSUM_LIMIT_BUCKETS (50).
   */
  hashChecksumLimitBuckets: number;
  /**
   * TIER 2 bucket size for the hash-checksum scan. Matches the bench's
   * HASH_CHECKSUM_BUCKET_SIZE (1000) — measured at ~140ms per full 10k pass.
   */
  hashChecksumBucketSize: number;
  /**
   * TIER 2 bucket size for the range-checksum (tax-rate) scan. Matches the
   * bench's RANGE_CHECKSUM_BUCKET_SIZE (1000).
   */
  rangeChecksumBucketSize: number;
  /**
   * Whether the integrity sweep also runs the tax-rate range-checksum.
   *
   * EXPERIMENTAL — defaults to FALSE. Unlike hash-checksum (which has the
   * server's absolute stored-vs-current `match` verdict), range-checksum offers
   * only a cross-sweep digest diff, and the engine gets no pull-success
   * feedback — so it cannot tell "drift I have not synced yet" from "drift I
   * already synced". The safe direction for an integrity backstop is to keep
   * flagging an unreconciled bucket (we do), but that means EVERY tax-rate
   * change — including ordinary hooked edits TIER 1 already reports — would
   * re-flag and escalate indefinitely. Since TIER 1 already covers all *hooked*
   * tax-rate changes (the common case), the rare hook-BYPASSING tax-rate write
   * is the only gap, and closing it correctly needs either a server-side
   * absolute signal for tax rates (symmetric with hash-checksum's `match`) or
   * pull-success feedback into the engine. Until then this stays opt-in. See
   * ADR 0005's residual note.
   */
  sweepTaxRates: boolean;
  /**
   * TIER 3 escalation threshold: a bucket that is STILL mismatched this many
   * consecutive sweeps AFTER its drifted ids were emitted as targeted pulls is
   * a real divergence the pull is not fixing — escalate it to revisionHashForIds
   * for the deepest repair signal. Counted in sweeps, not polls.
   */
  escalateToRevisionHashAfter: number;
};

export const DEFAULT_HYBRID_POLICY: HybridChangeSignalPolicy = {
  // TIER 1 — bench DEFAULT_PAGE_LIMIT; flat-cost page keeps every drain
  // sub-second (137–367ms at 10k good-local).
  sequenceLogLimit: 100,
  // A 100-page drain covers a 10k backlog in one poll; the cap is a runaway
  // guard, not an expected limit.
  maxSequenceLogPages: 100,
  // The matrix calls TIER 2 a "periodic" backstop, not a per-poll cost: with a
  // ~10s freshness target the routine poll runs often, so 1-in-10 keeps the
  // ~140ms scan's amortized cost negligible while still catching a
  // hook-bypassing write within ~100s of polling.
  sweepEveryNPolls: 10,
  // 5 min wall-clock ceiling so an idle/irregular poller still gets a bounded
  // integrity guarantee even if it never reaches the 10-poll count.
  sweepIntervalMs: 5 * 60 * 1000,
  // bench HASH_CHECKSUM_LIMIT_BUCKETS.
  hashChecksumLimitBuckets: 50,
  // bench HASH_CHECKSUM_BUCKET_SIZE — ~140ms per full 10k pass at this size.
  hashChecksumBucketSize: 1000,
  // bench RANGE_CHECKSUM_BUCKET_SIZE.
  rangeChecksumBucketSize: 1000,
  // Tax rates have no other backstop — TIER 1 only sees HOOKED tax-rate edits;
  // a SQL-bypassing tax-rate write needs this.
  sweepTaxRates: false,
  // Targeted pulls should reconcile a bucket within one sweep. Two consecutive
  // post-pull mismatches means the pull is NOT fixing it (a representation-only
  // drift, a stuck row) — only then pay revision-hash's deep cost.
  escalateToRevisionHashAfter: 2,
};

// --- Outcome types ------------------------------------------------------------

/** A routine change surfaced by TIER 1. `source` is the permanent provenance
 * tag (instrumentation is permanent per ADR 0004). */
export type HybridChange = {
  id: number;
  collection: HybridCollection;
  type: string;
  source: 'sequence-log';
};

/** A bucket the TIER 2 sweep flagged, tagged with the detector that found it. */
export type IntegrityMismatch = {
  bucket: number;
  detector: 'hash-checksum' | 'range-checksum';
};

export type HybridRepairTarget = {
  id: number;
  status: DriftedId['status'];
  collection: HybridCollection;
  detector: IntegrityMismatch['detector'];
};

export type HybridPollOutcome = {
  /** Routine changes from TIER 1, each tagged source: 'sequence-log'. */
  changes: HybridChange[];
  /** The advanced TIER 1 cursor. A sweep-only poll returns it UNCHANGED. */
  cursor: SequenceCursor;
  /** Whether the TIER 2 integrity sweep ran this poll. */
  sweepRan: boolean;
  /**
   * True when a sweep RAN but could not complete (a stalled hash-checksum
   * scan): the prefix's mismatches are still reported, but the integrity
   * backstop did NOT cover the whole catalog this poll and the baseline was
   * left untouched. A caller must NOT read a clean `integrityMismatches: []`
   * under `sweepIncomplete: true` as "integrity verified". Always false when
   * `sweepRan` is false.
   */
  sweepIncomplete: boolean;
  /** Buckets the sweep flagged, tagged with their detector (provenance). */
  integrityMismatches: IntegrityMismatch[];
  /** Drifted ids resolved by TIER 3 drill-down — the targeted pull set. */
  idsToPull: HybridRepairTarget[];
  /** Ids escalated to revisionHashForIds — the deepest repair signal. */
  escalatedIds: HybridRepairTarget[];
  /** Updated retained digests; cloned so hosts can persist without mutating the engine. */
  baselineDigests: BaselineDigests;
  /**
   * OPTIONAL TIER (ADR 0006). Collections whose representation-config
   * fingerprint moved this poll — "re-fetch / re-derive this collection",
   * connecting to the SAME re-fetch surface `idsToPull` feeds. PRESENT only when
   * a `configSource` was supplied; ABSENT (undefined) otherwise, so an engine
   * without the tier is byte-for-byte unchanged. A present-but-empty array means
   * "the config tier ran and nothing moved".
   */
  staleCollections?: BarcodeConfigCollection[];
  /**
   * OPTIONAL TIER (ADR 0006). The fingerprint moves behind `staleCollections`,
   * each tagged `source: 'config-fingerprint'` (provenance, ADR 0004). Present
   * only when a `configSource` was supplied.
   */
  configChanges?: ConfigFingerprintChange[];
  /**
   * OPTIONAL TIER (ADR 0006). The resolved active barcode field list from the
   * latest config snapshot, surfaced so the host can re-derive the local barcode
   * index for a stale `products` collection without a server round-trip. Present
   * only when the config source reports it.
   */
  configBarcodeFields?: Record<BarcodeConfigCollection, string[]>;
  /**
   * OPTIONAL TIER (ADR 0006). The updated retained config-fingerprint baseline,
   * cloned so hosts can persist it across restarts and seed the next engine —
   * the mechanism that catches an offline settings change on reconnect. Present
   * only when a `configSource` was supplied.
   */
  configBaseline?: ConfigFingerprintBaseline;
};

// --- Retained baselines (the engine's memory between sweeps) ------------------

/**
 * Per-bucket digest the engine retains to diff successive sweeps. For
 * hash-checksum it captures the stored/current digest+count tuple; for
 * range-checksum the checksum string + count. A bucket whose digest/count
 * differs from the retained baseline is a mismatch.
 */
export type BucketDigest =
  | { detector: 'hash-checksum'; count: number; digest: string; match: boolean }
  | { detector: 'range-checksum'; count: number; checksum: string; ids?: number[] };

/** Keyed `${detector}:${bucket}` so the two id-spaces never collide. */
export type BaselineDigests = Map<string, BucketDigest>;

function digestKey(detector: IntegrityMismatch['detector'], bucket: number): string {
  return `${detector}:${bucket}`;
}

function collectionForDetector(detector: IntegrityMismatch['detector']): HybridCollection {
  return detector === 'range-checksum' ? 'tax_rates' : 'products';
}

function repairKey(target: HybridRepairTarget): string {
  return `${target.collection}:${target.id}:${target.status}`;
}

function cloneBaselines(baselines: BaselineDigests): BaselineDigests {
  return new Map(
    [...baselines].map(([key, digest]) => [
      key,
      digest.detector === 'range-checksum' && digest.ids !== undefined
        ? { ...digest, ids: [...digest.ids] }
        : { ...digest },
    ]),
  );
}

// --- The engine ---------------------------------------------------------------

export type HybridChangeSignalEngine = {
  poll(): Promise<HybridPollOutcome>;
};

export function createHybridChangeSignalEngine(input: {
  source: ChangeSignalSource;
  /** Partial override of the matrix-derived defaults. */
  policy?: Partial<HybridChangeSignalPolicy>;
  /** Cursor the engine starts the TIER 1 drain from. Defaults to sequence 0. */
  initialCursor?: SequenceCursor;
  /**
   * Retained per-bucket baseline the sweep diffs against. A host that persists
   * digests across restarts seeds them here; otherwise the FIRST sweep adopts
   * whatever it scans as the baseline (no mismatch on a cold start — there is
   * nothing to diff yet) and subsequent sweeps detect drift from it.
   */
  baselineDigests?: BaselineDigests;
  /** Injected clock for the wall-clock sweep cadence. Defaults to Date.now. */
  now?: () => number;
  /**
   * OPTIONAL TIER (ADR 0006). When supplied, the engine composes a
   * representation-config fingerprint signal that runs on EVERY poll (cheap —
   * one fingerprint comparison) and surfaces `staleCollections` on the outcome.
   * Omit it and the tier does not exist: behavior is unchanged.
   */
  configSource?: ConfigFingerprintSource;
  /**
   * OPTIONAL TIER (ADR 0006). Persisted config-fingerprint baseline restored by
   * the host; seeds the composed config signal so a settings change that
   * happened while offline is caught on reconnect. Only meaningful alongside
   * `configSource`.
   */
  configBaseline?: ConfigFingerprintBaseline;
}): HybridChangeSignalEngine {
  const policy: HybridChangeSignalPolicy = { ...DEFAULT_HYBRID_POLICY, ...input.policy };
  const now = input.now ?? (() => Date.now());
  const { source } = input;

  // OPTIONAL TIER (ADR 0006): composed only when a config source is supplied.
  // Reuses the same injected clock so the whole engine shares one notion of now.
  const configSignal: ConfigChangeSignal | null = input.configSource
    ? createConfigChangeSignal({
        source: input.configSource,
        baseline: input.configBaseline,
        now,
      })
    : null;

  let cursor: SequenceCursor = input.initialCursor ?? { sequence: 0 };
  // The retained baseline; cloned so the caller's map is never mutated.
  // range-checksum detection is PER-BUCKET cold-start: a bucket with no baseline
  // entry is adopted on first sight, never flagged (see runSweep). hash-checksum
  // also honors the absolute `match` signal, then compares seeded buckets to
  // the retained baseline so rebuilt stored digests do not mask drift.
  const baselines: BaselineDigests = cloneBaselines(new Map(input.baselineDigests ?? []));
  // Consecutive post-pull mismatch count per bucket key, for TIER 3 escalation.
  const consecutiveMismatches = new Map<string, number>();

  let pollCount = 0;
  let lastSweepAtMs: number | null = null;
  let pollQueue: Promise<void> = Promise.resolve();
  // A due sweep that REJECTED or could not COMPLETE (a stalled scan) has not
  // run a full integrity pass — its cadence slot must not be consumed. Without
  // this, count-only cadence (e.g. every 10 polls) would skip the backstop
  // until the next slot even though the endpoint may have recovered next poll.
  // Forces the next poll to be sweep-due (codex review).
  let sweepRetryPending = false;

  function sweepDue(currentMs: number): boolean {
    if (sweepRetryPending) {
      return true;
    }
    // pollCount has already been incremented for THIS poll when this is called.
    const byCount = policy.sweepEveryNPolls > 0 && pollCount % policy.sweepEveryNPolls === 0;
    const byTime =
      policy.sweepIntervalMs > 0 &&
      (lastSweepAtMs === null || currentMs - lastSweepAtMs >= policy.sweepIntervalMs);
    return byCount || byTime;
  }

  // --- TIER 1: drain the sequence-log from the cursor (every poll) -----------
  // Drains into a LOCAL cursor and returns it; the engine's committed `cursor`
  // is only advanced by poll() once the whole poll has succeeded. If a later
  // page, the sweep, or drill-down rejects, the committed cursor is untouched
  // and the next poll re-drains the same rows. Re-delivering sequence-log rows
  // is safe (the pull applies them idempotently by id); SKIPPING them on a
  // transient endpoint error is not (codex review P1).
  async function drainSequenceLog(startCursor: SequenceCursor): Promise<{
    changes: HybridChange[];
    nextCursor: SequenceCursor;
  }> {
    const changes: HybridChange[] = [];
    let nextCursor = startCursor;
    let pages = 0;
    for (;;) {
      if (pages >= policy.maxSequenceLogPages) {
        // Safety cap hit: stop draining, keep the cursor we reached, let the
        // next poll resume. A runaway backlog or a host that never clears
        // hasMore must not spin a single poll forever.
        break;
      }
      const page = await source.pollSequenceLog({ cursor: nextCursor, limit: policy.sequenceLogLimit });
      pages += 1;
      nextCursor = page.cursor;
      for (const row of page.rows) {
        changes.push({
          id: row.id,
          collection: row.collection,
          type: row.type,
          source: 'sequence-log',
        });
      }
      if (!page.hasMore) {
        break;
      }
    }
    return { changes, nextCursor };
  }

  // --- TIER 2: scan both detectors, diff against retained baselines ----------
  async function runSweep(): Promise<{
    mismatches: IntegrityMismatch[];
    scanned: Map<string, BucketDigest>;
  }> {
    const scanned = new Map<string, BucketDigest>();
    const mismatches: IntegrityMismatch[] = [];

    // hash-checksum (products / wp_posts) — paginate afterId until complete.
    //
    // DETECTION IS ABSOLUTE, NOT CROSS-SWEEP. The scan's `match` field is the
    // SERVER's stored-vs-current verdict: match===false means this bucket has
    // drifted from what the hooks recorded (a hook-bypassing / sql-bypass
    // write). That verdict is stateless and self-contained — it does NOT depend
    // on a retained baseline — so we honour it ALWAYS, including on a cold start
    // with no seeded baseline. This mirrors the measured bench
    // (apps/web/src/bench/changeSignalMatrix.ts:523), which detects sql-bypass
    // as exactly buckets.filter(row => !row.match). A pre-existing bypassing
    // write therefore flags on the very first sweep instead of being silently
    // adopted as baseline.
    let afterId = 0;
    for (;;) {
      const page = await source.hashChecksumScan({
        bucketSize: policy.hashChecksumBucketSize,
        afterId,
        limitBuckets: policy.hashChecksumLimitBuckets,
      });
      for (const bucket of page.buckets) {
        const digest: BucketDigest = {
          detector: 'hash-checksum',
          count: bucket.current_count,
          digest: bucket.current_digest,
          match: bucket.match,
        };
        scanned.set(digestKey('hash-checksum', bucket.bucket), digest);
        // ABSOLUTE signal ONLY: `match === false` is the server's stored-vs-
        // current verdict — the authoritative sql-bypass detector — and it
        // reconciles cleanly the instant `match` returns to true. A cross-sweep
        // relative-digest diff was tried here and removed: it is provably
        // unsound offline. The engine has no pull-success feedback, so a
        // relative flag cannot tell a NORMAL hooked change (match:true, digest
        // moved, already handled by TIER 1 — should reconcile) from an
        // UNRECONCILED drift (should keep flagging). Adopting the digest masks
        // the latter; not adopting re-flags the former forever and eventually
        // escalates a change TIER 1 already handled. No adoption rule resolves
        // both — the same dilemma that keeps the range-checksum tax-rate sweep
        // experimental. hash-checksum therefore relies on its absolute verdict.
        if (!bucket.match) {
          mismatches.push({ bucket: bucket.bucket, detector: 'hash-checksum' });
        }
      }
      if (page.complete) {
        break;
      }
      if (page.nextAfterId === afterId) {
        throw new Error('Stalled hash-checksum scan: nextAfterId did not advance');
      }
      afterId = page.nextAfterId;
    }

    // range-checksum (tax rates) — single pass, optional. Tax-rate buckets carry
    // NO `match` field, so the SERVER gives no absolute verdict here. A
    // cross-sweep diff against the retained baseline is the ONLY available
    // signal, and it is only meaningful once a baseline exists (cold start
    // adopts the first scan and raises no RELATIVE drift).
    if (policy.sweepTaxRates) {
      const { buckets } = await source.rangeChecksumScan({
        collection: 'tax_rates',
        bucketSize: policy.rangeChecksumBucketSize,
      });
      for (const bucket of buckets) {
        const digest: BucketDigest = {
          detector: 'range-checksum',
          count: bucket.record_count,
          checksum: bucket.checksum,
          ids: bucket.ids === undefined ? undefined : [...bucket.ids],
        };
        const key = digestKey('range-checksum', bucket.bucket);
        scanned.set(key, digest);
        // PER-BUCKET cold start: only a bucket that ALREADY has a baseline can
        // be a relative mismatch. A first-seen tax-rate bucket (no baseline
        // yet) is adopted silently below, never flagged. Gating on
        // `baselines.has(key)` rather than a global baselineSeeded flag fixes
        // the case where the engine was seeded with ONLY hash-checksum
        // baselines and the opt-in tax sweep is later enabled — every
        // first-seen tax bucket would otherwise diff against `undefined` and
        // emit a false mismatch (codex review).
        if (baselines.has(key) && digestsDiffer(baselines.get(key), digest)) {
          mismatches.push({ bucket: bucket.bucket, detector: 'range-checksum' });
        }
      }
      // A range-checksum bucket present in the baseline but gone from the scan
      // is a divergence too (every rate in it deleted). Flag it every sweep it
      // stays gone — resolveMismatches must NOT evict its baseline key while it
      // is still an unreconciled mismatch (see DEFECT 2 fix there). The loop
      // only visits keys that ARE in the baseline, so a cold engine flags none.
      {
        for (const [key, previous] of baselines) {
          if (previous.detector === 'range-checksum' && !scanned.has(key)) {
            mismatches.push({ bucket: bucketOfKey(key), detector: 'range-checksum' });
          }
        }
      }
    }

    return { mismatches, scanned };
  }

  // --- TIER 3: drill down each mismatch, escalate stuck buckets --------------
  async function resolveMismatches(
    mismatches: IntegrityMismatch[],
    scanned: Map<string, BucketDigest>,
  ): Promise<{ idsToPull: HybridRepairTarget[]; escalatedIds: HybridRepairTarget[] }> {
    const idsToPull = new Map<string, HybridRepairTarget>();
    const escalatedIds = new Map<string, HybridRepairTarget>();
    // Track which bucket keys were mismatched THIS sweep so we can reset the
    // consecutive counter for every bucket that reconciled.
    const stillMismatchedKeys = new Set(
      mismatches.map((m) => digestKey(m.detector, m.bucket)),
    );
    // Streak updates are STAGED in a local copy and committed to
    // consecutiveMismatches only after every throwing await (drill-down,
    // revision-hash) below has succeeded. If a later drill-down or
    // revisionHashForIds rejects, poll() throws and retries the whole sweep —
    // the persistent streaks must NOT carry the half-done increments, or a
    // bucket could cross escalateToRevisionHashAfter on retry without any
    // targeted pull having been delivered (codex review).
    const nextStreaks = new Map(consecutiveMismatches);

    for (const mismatch of mismatches) {
      const key = digestKey(mismatch.detector, mismatch.bucket);
      const collection = collectionForDetector(mismatch.detector);
      const drilled = await source.drillDownBucket({
        detector: mismatch.detector,
        collection,
        bucketSize:
          mismatch.detector === 'hash-checksum'
            ? policy.hashChecksumBucketSize
            : policy.rangeChecksumBucketSize,
        bucket: mismatch.bucket,
      });
      const repairTargets = collectDriftTargets(mismatch, drilled, baselines.get(key));
      for (const target of repairTargets) {
        idsToPull.set(repairKey(target), target);
      }

      // Per-bucket consecutive-mismatch counter (staged in nextStreaks). This
      // sweep's mismatch is the count AFTER the previous sweep's targeted
      // pull(s) — so a bucket that crosses the threshold is one the targeted
      // pull did NOT reconcile.
      const streak = (nextStreaks.get(key) ?? 0) + 1;
      nextStreaks.set(key, streak);

      if (
        streak >= policy.escalateToRevisionHashAfter &&
        typeof source.revisionHashForIds === 'function' &&
        repairTargets.length > 0
      ) {
        const escalated = await escalateStuckBucket(
          mismatch.detector,
          repairTargets,
          source.revisionHashForIds,
        );
        for (const target of escalated) {
          escalatedIds.set(repairKey(target), target);
        }
      }
    }

    // Past here there are NO more throwing awaits — safe to commit the staged
    // streaks. (runSweep throws on a stalled scan BEFORE this function runs, so
    // resolveMismatches only ever executes on a complete scan.)
    commitStreaks(nextStreaks, stillMismatchedKeys, consecutiveMismatches);

    adoptScannedBaselines(scanned, stillMismatchedKeys, baselines);
    evictVanishedBaselines(scanned, stillMismatchedKeys, baselines);

    return { idsToPull: [...idsToPull.values()], escalatedIds: [...escalatedIds.values()] };
  }

  // OPTIONAL TIER (ADR 0006): compute the config diff and shape the fields the
  // hybrid outcome surfaces, but DEFER advancing the config baseline to the
  // poll's success points (see pollOnce). Returns a no-op commit + empty tier
  // when no config source was supplied, so the no-config path is byte-for-byte
  // unchanged. Computing here (before TIER 1) preserves source-call order;
  // committing only on success means a later TIER 1 / sweep failure cannot
  // STRAND a fingerprint move — the next poll re-computes against the
  // un-advanced baseline and re-reports it (the same redelivery-is-safe /
  // skipping-is-not invariant the cursor already honours).
  async function computeConfigTier(): Promise<{
    tier: {
      staleCollections?: BarcodeConfigCollection[];
      configChanges?: ConfigFingerprintChange[];
      configBarcodeFields?: Record<BarcodeConfigCollection, string[]>;
      configBaseline?: ConfigFingerprintBaseline;
    };
    commit: () => void;
  }> {
    if (configSignal === null) {
      return { tier: {}, commit: () => {} };
    }
    const deferred = await configSignal.pollDeferred();
    return {
      tier: {
        staleCollections: deferred.outcome.staleCollections,
        configChanges: deferred.outcome.changed,
        configBarcodeFields: deferred.outcome.barcodeFields,
        configBaseline: deferred.outcome.baseline,
      },
      commit: deferred.commit,
    };
  }

  return {
    async poll(): Promise<HybridPollOutcome> {
      const run = pollQueue.then(() => pollOnce(), () => pollOnce());
      pollQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  async function pollOnce(): Promise<HybridPollOutcome> {
    pollCount += 1;
    const currentMs = now();
    // Decide cadence ONCE up front. Any failure on a due poll — whether in the
    // TIER 1 drain or the TIER 2 sweep — must preserve the sweep slot, since
    // pollCount has already advanced and the next poll might not be count-due.
    // We set sweepRetryPending in the catch only when this poll was due, so the
    // failed sweep retries promptly rather than being skipped to the next slot
    // (codex review). Nothing here is committed until the whole poll succeeds.
    const due = sweepDue(currentMs);
    try {
      // OPTIONAL TIER (ADR 0006) — compute up front (preserving source-call
      // order), commit the config baseline only at the success points below,
      // alongside the cursor. When no config source is composed we DO NOT await:
      // the null branch is synchronous so the no-config path keeps its exact
      // microtask timing.
      const config = configSignal === null ? null : await computeConfigTier();
      const configTier = config === null ? {} : config.tier;

      // TIER 1 — always. Drained into a local cursor; not committed until the
      // whole poll succeeds (see drainSequenceLog).
      const { changes, nextCursor } = await drainSequenceLog(cursor);

      // TIER 2 — on cadence. A sweep does NOT advance the sequence cursor.
      if (!due) {
        cursor = nextCursor; // commit — nothing else can fail past here
        config?.commit(); // advance the config baseline together with the cursor
        return {
          changes,
          cursor,
          sweepRan: false,
          sweepIncomplete: false,
          integrityMismatches: [],
          idsToPull: [],
          escalatedIds: [],
          baselineDigests: cloneBaselines(baselines),
          ...configTier,
        };
      }
      // The sweep / drill-down run BEFORE the cursor is committed (a stalled
      // hash scan throws; an endpoint may error). On any throw the catch below
      // marks a retry and rethrows with the committed cursor untouched.
      const { mismatches, scanned } = await runSweep();
      const { idsToPull, escalatedIds } = await resolveMismatches(mismatches, scanned);

      // Everything succeeded — commit the cursor and the sweep clock together,
      // and clear any pending retry.
      cursor = nextCursor;
      lastSweepAtMs = currentMs;
      sweepRetryPending = false;
      config?.commit(); // advance the config baseline together with the cursor

      return {
        changes,
        cursor,
        sweepRan: true,
        sweepIncomplete: false,
        integrityMismatches: mismatches,
        idsToPull,
        escalatedIds,
        baselineDigests: cloneBaselines(baselines),
        ...configTier,
      };
    } catch (error) {
      if (due) {
        sweepRetryPending = true;
      }
      throw error;
    }
  }
}

// --- Pure helpers -------------------------------------------------------------

/**
 * PHASE 1 of resolveMismatches — turn one mismatch's drill-down result into
 * repair targets. When the drill-down returned NO ids but the bucket's retained
 * range-checksum baseline carries member ids, the bucket VANISHED (every rate
 * in it deleted): those retained ids are emitted as status:'deleted' targets.
 */
function collectDriftTargets(
  mismatch: IntegrityMismatch,
  drilled: { driftedIds: DriftedId[] },
  previous: BucketDigest | undefined,
): HybridRepairTarget[] {
  const collection = collectionForDetector(mismatch.detector);
  const driftedIds: DriftedId[] =
    drilled.driftedIds.length > 0
      ? drilled.driftedIds
      : previous?.detector === 'range-checksum' && previous.ids !== undefined
        ? previous.ids.map((id): DriftedId => ({ id, status: 'deleted' }))
        : [];
  return driftedIds.map((drifted) => ({
    id: drifted.id,
    status: drifted.status,
    // Honor a per-id collection from the drill-down (a hash-checksum bucket
    // spans products AND variations); fall back to the detector default
    // only when the drill-down did not disambiguate (codex review).
    // Resolved live (PR #204): the PHP drill-down endpoint
    // (plugins/woo-rxdb-sync/includes/class-integrity-controller.php) maps
    // each row's object_type → collection via collection_for_object_type
    // ('variation' → 'variations', else 'products'), so a drifted VARIATION
    // is labeled 'variations' and pulled through the right lane (ADR 0005).
    collection: drifted.collection ?? collection,
    detector: mismatch.detector,
  }));
}

/**
 * PHASE 2 of resolveMismatches — deepest repair for ONE stuck bucket: compute
 * revision hashes for its repair targets. A hash-checksum bucket can mix
 * products and variations, so escalate PER COLLECTION: a variation id must get
 * its revision computed against the variation path, not the detector-default
 * 'products' (codex review). Groups the bucket's targets by their resolved
 * collection. Throwing await: the caller must not commit staged streaks before
 * this succeeds.
 */
async function escalateStuckBucket(
  detector: IntegrityMismatch['detector'],
  repairTargets: HybridRepairTarget[],
  revisionHashForIds: NonNullable<ChangeSignalSource['revisionHashForIds']>,
): Promise<HybridRepairTarget[]> {
  const escalated: HybridRepairTarget[] = [];
  const targetsByCollection = new Map<HybridCollection, HybridRepairTarget[]>();
  for (const target of repairTargets) {
    const group = targetsByCollection.get(target.collection) ?? [];
    group.push(target);
    targetsByCollection.set(target.collection, group);
  }
  for (const [groupCollection, groupTargets] of targetsByCollection) {
    const { rows } = await revisionHashForIds({
      ids: groupTargets.map((t) => t.id),
      collection: groupCollection,
      detector,
    });
    for (const row of rows) {
      const target = groupTargets.find((candidate) => candidate.id === row.id) ?? {
        id: row.id,
        status: 'changed' as const,
        collection: groupCollection,
        detector,
      };
      escalated.push(target);
    }
  }
  return escalated;
}

/**
 * PHASE 3 of resolveMismatches — commit the staged streak counters into the
 * engine's persistent map. MUST only run after every throwing await of the
 * sweep succeeded (see the staging rationale where `nextStreaks` is created).
 * Reset the streak for every bucket the engine has ever counted that is NOT
 * mismatched this sweep — it reconciled, so a future mismatch starts fresh.
 */
function commitStreaks(
  nextStreaks: Map<string, number>,
  stillMismatchedKeys: ReadonlySet<string>,
  consecutiveMismatches: Map<string, number>,
): void {
  for (const key of [...nextStreaks.keys()]) {
    if (!stillMismatchedKeys.has(key)) {
      nextStreaks.delete(key);
    }
  }
  consecutiveMismatches.clear();
  for (const [key, streak] of nextStreaks) {
    consecutiveMismatches.set(key, streak);
  }
}

/**
 * PHASE 4 of resolveMismatches — adopt the freshly scanned digests as the new
 * baseline so the NEXT sweep diffs against current state. Buckets that
 * reconciled stop flagging; buckets still drifting keep flagging until the
 * pull lands. (For hash-checksum this is cosmetic — its detection is absolute
 * via `match` and ignores the baseline — but keeping the digests current is
 * harmless and lets a host inspect the retained map.)
 */
function adoptScannedBaselines(
  scanned: ReadonlyMap<string, BucketDigest>,
  stillMismatchedKeys: ReadonlySet<string>,
  baselines: BaselineDigests,
): void {
  for (const [key, digest] of scanned) {
    // Do NOT let an unreconciled RANGE-CHECKSUM mismatch overwrite its own
    // baseline: range-checksum's only signal is the cross-sweep diff, so
    // adopting the divergent digest as the new "known good" would make the
    // next sweep compare clean and reset the streak BEFORE the targeted pull
    // reconciled it (codex review P2). hash-checksum needs no such guard now
    // that it detects purely on the absolute `match` verdict (which ignores
    // the baseline), so adopting its digests is harmless bookkeeping.
    if (
      digest.detector === 'range-checksum' &&
      baselines.get(key)?.detector === 'range-checksum' &&
      stillMismatchedKeys.has(key)
    ) {
      continue;
    }
    baselines.set(key, digest);
  }
}

/**
 * PHASE 5 of resolveMismatches — drop baseline keys for buckets that vanished
 * from this scan, EXCEPT unreconciled range-checksum mismatches.
 *
 * DEFECT 2 fix: a baseline key absent from this scan is normally a deleted
 * bucket we can drop. But a RANGE-CHECKSUM bucket that vanished AND was
 * flagged as a mismatch THIS sweep is an UNRECONCILED divergence — if we
 * evicted its baseline now, the next sweep would have nothing to diff
 * against and the bucket would go silent forever, never building the
 * escalation streak. So we KEEP a vanished range-checksum baseline while it
 * remains an unreconciled mismatch, and only drop it once it reconciles
 * (reappears matching, so it is in `scanned` and updated by the adoption
 * phase, or its baseline is otherwise no longer flagged).
 *
 * Conservative offline choice (flagged for live conformance): we keep
 * flagging a vanished tax-rate bucket until it REAPPEARS MATCHING its
 * retained baseline. A live server may treat a hooked tax-rate delete
 * already reported by TIER 1 as a legitimate reconciliation that should stop
 * the flag even though the bucket stays absent; that cross-tier
 * reconciliation needs server semantics we cannot verify offline. If that
 * rule is required, it belongs here.
 */
function evictVanishedBaselines(
  scanned: ReadonlyMap<string, BucketDigest>,
  stillMismatchedKeys: ReadonlySet<string>,
  baselines: BaselineDigests,
): void {
  for (const key of [...baselines.keys()]) {
    if (scanned.has(key)) {
      continue;
    }
    const previous = baselines.get(key);
    const isUnreconciledRangeMismatch =
      previous?.detector === 'range-checksum' && stillMismatchedKeys.has(key);
    if (isUnreconciledRangeMismatch) {
      // Retain the baseline so the next sweep can re-detect (and the streak
      // can grow toward escalation). Do NOT evict.
      continue;
    }
    baselines.delete(key);
  }
}

/** Two retained digests differ when their detector-relevant fields move. */
export function digestsDiffer(previous: BucketDigest | undefined, current: BucketDigest): boolean {
  if (previous === undefined) {
    // A bucket the baseline never saw is new content — a mismatch.
    return true;
  }
  if (previous.detector !== current.detector) {
    return true;
  }
  if (current.detector === 'hash-checksum' && previous.detector === 'hash-checksum') {
    // The scan's own `match` flag is the absolute server-side signal (stored vs
    // current digest); a false there means a hook-bypassing write regardless of
    // the prior baseline. We ALSO diff the current digest/count against the
    // retained baseline so drift between two sweeps is caught even when a single
    // scan's stored side has since been rebuilt to match.
    return (
      !current.match ||
      previous.digest !== current.digest ||
      previous.count !== current.count
    );
  }
  if (current.detector === 'range-checksum' && previous.detector === 'range-checksum') {
    return previous.checksum !== current.checksum || previous.count !== current.count;
  }
  return true;
}

function bucketOfKey(key: string): number {
  const bucket = Number(key.slice(key.indexOf(':') + 1));
  return Number.isFinite(bucket) ? bucket : -1;
}
