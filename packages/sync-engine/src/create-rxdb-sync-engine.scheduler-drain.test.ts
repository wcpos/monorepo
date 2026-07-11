/**
 * Slice 5e: the persisted scheduler DRAIN through the public handle —
 * sync('order-window-seed') persists the windowed task, sync('scheduler-drain')
 * claims it and pulls through the scripted server, orders land in the scope
 * database and the custom-pull checkpoint store advances. mode:'manual', the
 * slice-3 scripted-server style.
 */

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { createRxdbSyncEngine, type RxdbSyncEngine, type RxdbSyncEnginePorts, type StoreScopeIdentity } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';
import { seedTargetedCustomerSchedulerTask } from './scheduler/rx-scheduler-customer-task-seeder';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
const UUID_1 = '11111111-1111-4111-8111-111111111111';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
  uniqueStore += 1;
  return { site: SITE, storeId: 9, cashierId: `drain-${uniqueStore}` };
}

/** A scripted server for the windowed browser-filter lane: the /orders proxy
 * returns one open order (uuid-stamped meta — the projection keys by it). */
function scriptedOrderServer() {
  const state = { pulls: 0, urls: [] as string[] };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetch = async (url: string): Promise<Response> => {
    state.urls.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith('/orders')) {
      state.pulls += 1;
      return json([{
        id: 1,
        number: '1001',
        status: 'processing',
        total: '10.00',
        date_created_gmt: '2026-07-10T00:00:00',
        date_modified_gmt: '2026-07-10T00:00:01',
        customer_id: 0,
        _rxdb_digest: 'order-digest-1',
        meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_1 }],
      }]);
    }
    throw new Error(`scripted order server: unexpected ${u.pathname}`);
  };
  return { state, fetch };
}

function engineWith(fetch: (url: string) => Promise<Response>, overrides?: Partial<RxdbSyncEnginePorts>): RxdbSyncEngine {
  return createRxdbSyncEngine({
    site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
    storage: memoryEngineStorage(),
    fetcher: (url) => fetch(url),
    mode: 'manual',
    ...overrides,
  }, freshIdentity());
}

describe('scheduler drain through the public handle (slice 5e)', () => {
  it('seed → drain: the windowed order task pulls through the transport port and lands orders + checkpoint', async () => {
    const server = scriptedOrderServer();
    const engine = engineWith(server.fetch);
    await engine.ready;

    expect((await engine.sync('order-window-seed')).status).toBe('ran');
    const drained = await engine.sync('scheduler-drain');
    expect(drained.status).toBe('ran');
    expect(server.state.pulls).toBeGreaterThan(0);

    const scope = engine.active();
    if (!scope) throw new Error('no active scope');
    const orders = await (scope.database.collections.orders as { find(): { exec(): Promise<Array<{ toJSON(): Record<string, unknown> }>> } }).find().exec();
    expect(orders).toHaveLength(1);
    expect(orders[0]!.toJSON()['wooOrderId']).toBe(1);
    expect((await scope.database.collections.existenceManifestOrders.findOne('1').exec())?.toJSON())
      .toMatchObject({ wooId: 1, objectType: 'order', digest: 'order-digest-1' });

    // syncCheckpoints (new to the engine recipe) is open on the scope database —
    // the custom-pull greedy lane writes it; the windowed proxy lane does not.
    expect(scope.database.collections.syncCheckpoints).toBeDefined();
    expect(engine.status().lanes['scheduler-drain']).toMatchObject({ lastError: null, lastTick: { status: 'ran' } });
    await engine.dispose();
  });

  it('scheduler-fetched customers land both the stripped document and customer manifest row', async () => {
    const customerUuid = '41414141-4141-4141-8141-414141414141';
    const engine = engineWith(async (url) => {
      const u = new URL(url);
      if (!u.pathname.endsWith('/customers')) throw new Error(`unexpected ${u.pathname}`);
      return new Response(JSON.stringify([{
        id: 41,
        email: 'customer@example.test',
        _rxdb_digest: 'customer-digest-41',
        meta_data: [{ key: '_woocommerce_pos_uuid', value: customerUuid }],
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await engine.ready;

    const scope = engine.active();
    if (!scope) throw new Error('no active scope');
    await seedTargetedCustomerSchedulerTask({
      customerIds: [41],
      nowMs: 1,
      getRepository: async () => ({ getDatabase: () => scope.database.collections as never }),
    });
    await expect(engine.sync('scheduler-drain')).resolves.toMatchObject({ status: 'ran' });

    const customer = await scope.database.collections.customers.findOne(customerUuid).exec();
    expect(customer?.toJSON()).toMatchObject({ wooCustomerId: 41, payload: { email: 'customer@example.test' } });
    expect('_rxdb_digest' in (customer!.toJSON().payload as object)).toBe(false);
    expect((await scope.database.collections.existenceManifestCustomers.findOne('41').exec())?.toJSON())
      .toMatchObject({ wooId: 41, objectType: 'customer', digest: 'customer-digest-41' });
    await engine.dispose();
  });

  it('drain with nothing queued reports ran with no server traffic', async () => {
    const server = scriptedOrderServer();
    const diagnostics = vi.fn();
    const engine = engineWith(server.fetch, { diagnostics });
    await engine.ready;
    await engine.sync('scheduler-drain');
    diagnostics.mockClear();
    const report = await engine.sync('scheduler-drain');
    expect(report.status).toBe('ran');
    expect(server.state.pulls).toBe(0);
    expect(diagnostics.mock.calls.some(([event]) => event.type === 'queue.scheduler.drain')).toBe(false);
    await engine.dispose();
  });
});
