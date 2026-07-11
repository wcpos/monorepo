/**
 * Representation-config fingerprint signal (ADR 0006, Scenario 1 —
 * settings-change staleness) against a deterministic FAKE
 * ConfigFingerprintSource (the fakeHost pattern). These pin the new tier the
 * hybrid engine was structurally blind to: a global WCPOS/WooCommerce SETTING
 * change that alters the SERVED representation of MANY records without bumping
 * any record's date_modified and without touching any record's storage. The
 * canonical case is the POS "barcode" meta-key mapping flipping from `_sku` to
 * `_global_unique_id`: every product's effective barcode changes, but no
 * product row changes — TIER 1 (no hook), TIER 2 hash-checksum (raw row
 * unchanged) are both blind, TIER 3 revision-hash would catch it but is never
 * polled.
 *
 * No rxdb, no fetch, no DOM — only the injected source + a fake clock.
 */

import { describe, expect, it } from 'vitest';
import {
  createConfigChangeSignal,
  type ConfigFingerprintSource,
  type ConfigFingerprintSnapshot,
} from './configChangeSignal';
import {
  buildLocalBarcodeIndex,
  rebuildBarcodeIndexForConfig,
} from './barcodeResolve';
import {
  createHybridChangeSignalEngine,
  type ChangeSignalSource,
} from './hybridChangeSignal';

// --- Fake source builder ------------------------------------------------------

type FakeConfigSourceConfig = {
  /**
   * Successive snapshots handed out in order on each poll; the last repeats
   * (an idle config that stops changing).
   */
  snapshots: ConfigFingerprintSnapshot[];
};

type ConfigCalls = {
  pollConfigFingerprints: number;
};

function makeFakeConfigSource(config: FakeConfigSourceConfig) {
  const calls: ConfigCalls = { pollConfigFingerprints: 0 };
  let index = 0;
  const source: ConfigFingerprintSource = {
    async pollConfigFingerprints() {
      calls.pollConfigFingerprints += 1;
      const snapshot = config.snapshots[Math.min(index, config.snapshots.length - 1)];
      if (index < config.snapshots.length - 1) {
        index += 1;
      }
      return snapshot;
    },
  };
  return { source, calls };
}

// --- The headline scenario ----------------------------------------------------

describe('createConfigChangeSignal — settings-change staleness', () => {
  it('flags products stale when the barcode-field fingerprint moves (no date_modified bump, no record change)', async () => {
    // Snapshot 1: barcode field is _sku. Snapshot 2: admin flips it to
    // _global_unique_id — the fingerprint changes, nothing else does.
    const { source } = makeFakeConfigSource({
      snapshots: [
        {
          fingerprints: { products: 'fp-sku', variations: 'v0', tax_rates: 't0' },
          barcodeFields: { products: ['sku'], variations: ['sku'], tax_rates: [] },
        },
        {
          fingerprints: { products: 'fp-guid', variations: 'v0', tax_rates: 't0' },
          barcodeFields: {
            products: ['global_unique_id'],
            variations: ['global_unique_id'],
            tax_rates: [],
          },
        },
      ],
    });
    const engine = createConfigChangeSignal({ source });

    // First poll: cold start, no baseline → adopt, do NOT flag.
    const first = await engine.poll();
    expect(first.staleCollections).toEqual([]);
    expect(first.changed).toEqual([]);

    // Second poll: the fingerprint moved → products stale.
    const second = await engine.poll();
    expect(second.staleCollections).toEqual(['products']);
    expect(second.changed).toEqual([
      { collection: 'products', from: 'fp-sku', to: 'fp-guid', source: 'config-fingerprint' },
    ]);
  });

  it('provides the resolved active barcode field list so the client can re-derive locally', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        {
          fingerprints: { products: 'fp-sku', variations: 'v0', tax_rates: 't0' },
          barcodeFields: { products: ['sku'], variations: ['sku'], tax_rates: [] },
        },
        {
          fingerprints: { products: 'fp-guid', variations: 'v0', tax_rates: 't0' },
          barcodeFields: {
            products: ['global_unique_id'],
            variations: ['global_unique_id'],
            tax_rates: [],
          },
        },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    await engine.poll();
    const second = await engine.poll();
    expect(second.barcodeFields?.products).toEqual(['global_unique_id']);
  });
});

// --- No false positive --------------------------------------------------------

describe('createConfigChangeSignal — no false positive', () => {
  it('does not flag stale when the config is unchanged across polls', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'fp-a', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    expect((await engine.poll()).staleCollections).toEqual([]);
    expect((await engine.poll()).staleCollections).toEqual([]);
    expect((await engine.poll()).staleCollections).toEqual([]);
  });
});

// --- Cold-start adopt-vs-flag semantics --------------------------------------

describe('createConfigChangeSignal — cold-start semantics', () => {
  it('a FIRST poll with NO persisted baseline adopts the current fingerprints WITHOUT flagging (no startup false positive)', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'fp-current', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    const first = await engine.poll();
    expect(first.staleCollections).toEqual([]);
    expect(first.changed).toEqual([]);
    // The adopted baseline is surfaced so a host can persist it.
    expect(first.baseline.products).toBe('fp-current');
  });

  it('a FIRST poll WITH a persisted prior baseline that DISAGREES flags stale (a settings change while offline is caught on reconnect)', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'fp-new', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({
      source,
      // The host restored the fingerprint it last saw before going offline.
      baseline: { products: 'fp-old', variations: 'v0', tax_rates: 't0' },
    });
    const first = await engine.poll();
    expect(first.staleCollections).toEqual(['products']);
    expect(first.changed).toEqual([
      { collection: 'products', from: 'fp-old', to: 'fp-new', source: 'config-fingerprint' },
    ]);
  });

  it('a FIRST poll WITH a persisted baseline that AGREES does not flag', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'fp-same', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({
      source,
      baseline: { products: 'fp-same', variations: 'v0', tax_rates: 't0' },
    });
    expect((await engine.poll()).staleCollections).toEqual([]);
  });
});

// --- Multi-collection isolation ----------------------------------------------

describe('createConfigChangeSignal — multi-collection isolation', () => {
  it('a products fingerprint move does NOT mark tax_rates stale', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'p0', variations: 'v0', tax_rates: 't0' } },
        { fingerprints: { products: 'p1', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    await engine.poll();
    const second = await engine.poll();
    expect(second.staleCollections).toEqual(['products']);
    expect(second.staleCollections).not.toContain('tax_rates');
    expect(second.staleCollections).not.toContain('variations');
  });

  it('reports every collection whose fingerprint moved when several change at once', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'p0', variations: 'v0', tax_rates: 't0' } },
        { fingerprints: { products: 'p1', variations: 'v0', tax_rates: 't1' } },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    await engine.poll();
    const second = await engine.poll();
    expect(second.staleCollections.sort()).toEqual(['products', 'tax_rates']);
  });
});

// --- Self-healing (fingerprint, not a hook counter) ---------------------------

describe('createConfigChangeSignal — self-healing', () => {
  it('detects a config change made by a hook-BYPASSING path (no counter bumped) because the fingerprint is computed from the ACTUAL settings', async () => {
    // Simulate a bypassing change: a counter-based signal would have stayed
    // put (no hook fired), but the fingerprint differs because it is hashed
    // from the real current settings — so the change is still detected.
    const { source } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'hash-of-settings-v1', variations: 'v0', tax_rates: 't0' } },
        // wp-cli / direct wp_options write changed the setting; no hook ran,
        // but the fingerprint (a hash of the real options) moved.
        { fingerprints: { products: 'hash-of-settings-v2', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    await engine.poll();
    const second = await engine.poll();
    expect(second.staleCollections).toEqual(['products']);
  });
});

// --- Barcode re-derivation (the product specialization) -----------------------

describe('rebuildBarcodeIndexForConfig — re-derive from already-synced docs', () => {
  const syncedDocs = [
    { id: 'p-1', payload: { sku: 'SKU-1', global_unique_id: 'GTIN-1' } },
    { id: 'p-2', payload: { sku: 'SKU-2', global_unique_id: 'GTIN-2' } },
  ];

  it('re-derives the index to the NEW field from already-synced docs without a server round-trip (old code no longer resolves, new code does)', async () => {
    const { source } = makeFakeConfigSource({
      snapshots: [
        {
          fingerprints: { products: 'fp-sku', variations: 'v0', tax_rates: 't0' },
          barcodeFields: { products: ['sku'], variations: ['sku'], tax_rates: [] },
        },
        {
          fingerprints: { products: 'fp-guid', variations: 'v0', tax_rates: 't0' },
          barcodeFields: {
            products: ['global_unique_id'],
            variations: ['global_unique_id'],
            tax_rates: [],
          },
        },
      ],
    });
    const engine = createConfigChangeSignal({ source });
    await engine.poll();
    const second = await engine.poll();
    expect(second.staleCollections).toEqual(['products']);

    const activeFields = second.barcodeFields?.products ?? [];
    const result = rebuildBarcodeIndexForConfig({
      docs: syncedDocs,
      activeFields,
    });
    expect(result.rederived).toBe(true);
    // New field resolves.
    expect(result.index.get('GTIN-1')).toEqual({ docId: 'p-1' });
    expect(result.index.get('GTIN-2')).toEqual({ docId: 'p-2' });
    // Old code (SKU) no longer resolves under the new mapping.
    expect(result.index.get('SKU-1')).toBeUndefined();
    expect(result.index.get('SKU-2')).toBeUndefined();
  });

  it('falls back to collection-stale (re-fetch) when a needed field is NOT present in the synced payload', () => {
    const docsMissingField = [
      { id: 'p-1', payload: { sku: 'SKU-1' } }, // no global_unique_id in payload
    ];
    const result = rebuildBarcodeIndexForConfig({
      docs: docsMissingField,
      activeFields: ['global_unique_id'],
    });
    expect(result.rederived).toBe(false);
    expect(result.staleCollection).toBe(true);
  });

  it('honors the active field list — a field-mapping change is reflected (no longer hardcoded to BARCODE_PAYLOAD_FIELDS)', () => {
    const docs = [{ id: 'p-1', payload: { sku: 'SKU-1', global_unique_id: 'GTIN-1' } }];
    // Only barcode by sku.
    const skuOnly = rebuildBarcodeIndexForConfig({ docs, activeFields: ['sku'] });
    expect(skuOnly.index.get('SKU-1')).toEqual({ docId: 'p-1' });
    expect(skuOnly.index.get('GTIN-1')).toBeUndefined();
    // Now barcode by global_unique_id only.
    const guidOnly = rebuildBarcodeIndexForConfig({ docs, activeFields: ['global_unique_id'] });
    expect(guidOnly.index.get('GTIN-1')).toEqual({ docId: 'p-1' });
    expect(guidOnly.index.get('SKU-1')).toBeUndefined();
  });

  it('default buildLocalBarcodeIndex still indexes all hardcoded fields (backward compatible)', () => {
    const { index } = buildLocalBarcodeIndex([
      { id: 'p-1', payload: { sku: 'SKU-1', barcode: 'BAR-1', global_unique_id: 'GTIN-1' } },
    ]);
    expect(index.get('SKU-1')).toEqual({ docId: 'p-1' });
    expect(index.get('BAR-1')).toEqual({ docId: 'p-1' });
    expect(index.get('GTIN-1')).toEqual({ docId: 'p-1' });
  });
});

// --- Backward compatibility with the hybrid engine ----------------------------

describe('hybrid engine backward compatibility', () => {
  function makeHybridSource(): ChangeSignalSource {
    return {
      async pollSequenceLog(input) {
        return { rows: [], cursor: input.cursor, hasMore: false };
      },
      async hashChecksumScan() {
        return { buckets: [], complete: true, nextAfterId: 0 };
      },
      async rangeChecksumScan() {
        return { buckets: [] };
      },
      async drillDownBucket() {
        return { driftedIds: [] };
      },
    };
  }

  it('a hybrid engine with NO config source behaves exactly as before (no staleCollections surfaced)', async () => {
    const engine = createHybridChangeSignalEngine({ source: makeHybridSource() });
    const outcome = await engine.poll();
    expect(outcome.changes).toEqual([]);
    // The optional config tier is absent → the field is empty, not present-but-noisy.
    expect(outcome.staleCollections ?? []).toEqual([]);
  });

  it('a hybrid engine WITH a config source surfaces staleCollections when a fingerprint moves', async () => {
    const { source: configSource } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'p0', variations: 'v0', tax_rates: 't0' } },
        { fingerprints: { products: 'p1', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createHybridChangeSignalEngine({
      source: makeHybridSource(),
      configSource,
    });
    const first = await engine.poll();
    expect(first.staleCollections ?? []).toEqual([]);
    const second = await engine.poll();
    expect(second.staleCollections).toEqual(['products']);
    expect(second.configChanges).toEqual([
      { collection: 'products', from: 'p0', to: 'p1', source: 'config-fingerprint' },
    ]);
  });
});

describe('hybrid engine — a config fingerprint move survives a FAILED poll (Codex P1)', () => {
  function makeHybridSourceFailingSeqOnce(failOnCall: number): ChangeSignalSource {
    let seqCalls = 0;
    return {
      async pollSequenceLog(input) {
        seqCalls += 1;
        if (seqCalls === failOnCall) {
          throw new Error('TIER 1 transient failure');
        }
        return { rows: [], cursor: input.cursor, hasMore: false };
      },
      async hashChecksumScan() {
        return { buckets: [], complete: true, nextAfterId: 0 };
      },
      async rangeChecksumScan() {
        return { buckets: [] };
      },
      async drillDownBucket() {
        return { driftedIds: [] };
      },
    };
  }

  it('re-reports staleCollections on the next successful poll when an earlier poll step threw after the fingerprint moved', async () => {
    // The config fingerprint moves products p0 -> p1 on poll 2, but TIER 1
    // drainSequenceLog throws on poll 2 so the whole poll rejects. The config
    // baseline must NOT advance on a failed poll (ADR 0005's commit-only-on-
    // success invariant, which the config tier must honour too): poll 3 STILL
    // reports products stale. Before the deferred-commit fix the eager baseline
    // adoption swallowed the move permanently.
    const source = makeHybridSourceFailingSeqOnce(2);
    const { source: configSource } = makeFakeConfigSource({
      snapshots: [
        { fingerprints: { products: 'p0', variations: 'v0', tax_rates: 't0' } },
        { fingerprints: { products: 'p1', variations: 'v0', tax_rates: 't0' } },
      ],
    });
    const engine = createHybridChangeSignalEngine({ source, configSource });

    const first = await engine.poll();
    expect(first.staleCollections ?? []).toEqual([]);

    // Poll 2: fingerprint moved, but TIER 1 throws → the whole poll rejects.
    await expect(engine.poll()).rejects.toThrow('TIER 1 transient failure');

    // Poll 3: TIER 1 recovers. The move was not silently swallowed — products is
    // still stale because neither the cursor nor the config baseline advanced on
    // the failed poll.
    const third = await engine.poll();
    expect(third.staleCollections).toEqual(['products']);
    expect(third.configChanges).toEqual([
      { collection: 'products', from: 'p0', to: 'p1', source: 'config-fingerprint' },
    ]);
  });
});
