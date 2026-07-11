/**
 * Schema BEHAVIOUR tests (#426) — the test surface is the modules' interface,
 * not the literals: every exported schema must (a) be accepted by real RxDB,
 * (b) round-trip a representative document through an ajv-validated
 * collection, and (c) migrate real stored documents written under its
 * PREVIOUS versions, driven by RxDB's own migration machinery (old-version
 * fixture schema → close → reopen at the current version over the SAME
 * storage). A field reorder no longer fails anything; a schema RxDB would
 * reject no longer passes.
 *
 * The four reference schemas' byte-identity (minus title) is asserted as a
 * RECORDED DECISION (ADR 0019): they are deliberately explicit as-const
 * literals, free to diverge — deliberate divergence edits that one test.
 */

import { describe, expect, it } from 'vitest';
// Premium stays host-side; the test harness is the host (same rationale as
// createRxdbSyncEngine.test.ts — open-core caps open collections at 13).
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { addRxPlugin, createRxDatabase, type MigrationStrategies, type RxCollection, type RxStorage } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { promotedOrderColumns, promotedProductColumns, customerDocumentId } from '@woo-rxdb-lab/shared';
import { recordMutationQueueSchema, recordMutationQueueMigrationStrategies, type QueuedMutation } from '@woo-rxdb-lab/sync-core';
import { memoryEngineStorage } from '../testing';
import { orderSchema, orderMigrationStrategies } from './order-schema';
import { productSchema, productMigrationStrategies } from './product-schema';
import { variationSchema, variationMigrationStrategies, promotedVariationColumns, withVariationColumns } from './variation-schema';
import { customerSchema } from './customer-schema';
import { taxRateSchema, taxRateDocumentId } from './tax-rate-schema';
import { categorySchema, brandSchema, tagSchema, couponSchema, referenceDocumentId } from './reference-collection-schema';
import { syncCheckpointSchema, syncCheckpointMigrationStrategies } from './sync-checkpoint-schema';
import { changeSignalStateSchema, CHANGE_SIGNAL_STATE_ID } from '../change-signal/change-signal-state-schema';
import { existenceManifestSchema, existenceManifestDocument } from '../local-coverage/existence-manifest-schema';

setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);

let dbSeq = 0;

async function openCollection(input: {
  schema: unknown;
  migrationStrategies?: MigrationStrategies;
  storage?: RxStorage<unknown, unknown>;
  dbName?: string;
}): Promise<{ db: { close(): Promise<unknown> }; collection: RxCollection }> {
  const db = await createRxDatabase({
    name: input.dbName ?? `schema-behaviour-${(dbSeq += 1)}`,
    storage: input.storage ?? memoryEngineStorage(),
    multiInstance: false,
  });
  await db.addCollections({
    docs: {
      schema: input.schema,
      ...(input.migrationStrategies ? { migrationStrategies: input.migrationStrategies } : {}),
    } as never,
  });
  return { db, collection: db.collections.docs };
}

/** Round-trip: RxDB accepts the schema, and a representative doc validates and reads back. */
async function expectRoundTrip(input: {
  schema: unknown;
  migrationStrategies?: MigrationStrategies;
  document: Record<string, unknown>;
}): Promise<void> {
  const { db, collection } = await openCollection(input);
  await collection.insert(input.document);
  const read = await collection.findOne(input.document.id as string).exec();
  expect(read).not.toBeNull();
  expect(read!.toJSON()).toEqual(input.document);
  await db.close();
}

const ORDER_PAYLOAD = {
  id: 42,
  number: '1042',
  date_created_gmt: '2026-07-01T10:00:00',
  status: 'processing',
  total: '25.50',
  customer_id: 7,
};

const PRODUCT_PAYLOAD = {
  id: 9,
  price: '12.345',
  stock_status: 'instock',
  type: 'simple',
  categories: [{ id: 3 }, { id: 5 }],
  brands: [{ id: 11 }],
  on_sale: true,
  featured: false,
  stock_quantity: 3.6, // decimal-preserving on purpose (fractional stock)
};

const VARIATION_PAYLOAD = {
  id: 77,
  price: '4.20',
  stock_status: 'instock',
  attributes: [{ id: 1, name: 'Size', option: 'L' }],
  stock_quantity: null,
};

describe('every exported schema is accepted by RxDB and round-trips a representative document', () => {
  it('orders', async () => {
    await expectRoundTrip({
      schema: orderSchema,
      migrationStrategies: orderMigrationStrategies,
      document: {
        id: 'woo-order:42',
        wooOrderId: 42,
        ...promotedOrderColumns(ORDER_PAYLOAD),
        payload: ORDER_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
    });
  });

  it('products', async () => {
    await expectRoundTrip({
      schema: productSchema,
      migrationStrategies: productMigrationStrategies,
      document: {
        id: 'woo-product:9',
        wooProductId: 9,
        ...promotedProductColumns(PRODUCT_PAYLOAD),
        payload: PRODUCT_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
    });
  });

  it('variations', async () => {
    await expectRoundTrip({
      schema: variationSchema,
      migrationStrategies: variationMigrationStrategies,
      document: withVariationColumns({
        id: 'woo-variation:77',
        wooId: 77,
        parentId: 9,
        payload: VARIATION_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
      }),
    });
  });

  it('customers', async () => {
    expect(customerDocumentId(42)).toBe('woo-customer:42');
    await expectRoundTrip({
      schema: customerSchema,
      document: {
        id: customerDocumentId(42),
        wooCustomerId: 42,
        payload: { id: 42, date_modified_gmt: '2026-07-01T10:00:00' },
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
    });
  });

  it('taxRates', async () => {
    expect(taxRateDocumentId(7)).toBe('woo-tax-rate:7');
    await expectRoundTrip({
      schema: taxRateSchema,
      document: {
        id: taxRateDocumentId(7),
        wooTaxRateId: 7,
        payload: { id: 7, rate: '10.0' },
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
      },
    });
  });

  it.each([
    ['categories', categorySchema, 'woo-category'],
    ['brands', brandSchema, 'woo-brand'],
    ['tags', tagSchema, 'woo-tag'],
    ['coupons', couponSchema, 'woo-coupon'],
  ] as const)('%s', async (_name, schema, prefix) => {
    await expectRoundTrip({
      schema,
      document: {
        id: referenceDocumentId(prefix, 3),
        wooId: 3,
        payload: { id: 3, name: 'Ref' },
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
      },
    });
  });

  it('syncCheckpoints', async () => {
    await expectRoundTrip({
      schema: syncCheckpointSchema,
      migrationStrategies: syncCheckpointMigrationStrategies,
      document: {
        id: 'orders:custom-pull',
        checkpoint: { updatedAtGmt: '2026-07-01T10:00:00', orderId: 42, revision: 'r1', sequence: 3 },
        updatedAt: '2026-07-01T10:00:01.000Z',
        epoch: 'epoch-1',
      },
    });
  });

  it('changeSignalStates', async () => {
    await expectRoundTrip({
      schema: changeSignalStateSchema,
      document: {
        id: CHANGE_SIGNAL_STATE_ID,
        state: JSON.stringify({ cursor: 12 }),
        updatedAt: '2026-07-01T10:00:01.000Z',
      },
    });
  });

  it('existenceManifest', async () => {
    const row = existenceManifestDocument({ wooId: 9, objectType: 'product', digest: '18446744073709551615' });
    expect(row).toEqual({ id: '9', wooId: 9, objectType: 'product', digest: '18446744073709551615' });
    await expectRoundTrip({ schema: existenceManifestSchema, document: row });
  });
});

/**
 * Real migrations: write documents under an OLD-version fixture schema (the
 * shape on disk before the promoted columns / epoch existed), close, reopen
 * the SAME storage at the current version, and let RxDB's migration plugin
 * run every strategy. This is the path a real device takes on upgrade.
 */
describe('stored documents migrate through every schema version', () => {
  async function migrate(input: {
    fixtureSchema: Record<string, unknown>;
    fixtureMigrationStrategies?: MigrationStrategies;
    oldDocument: Record<string, unknown>;
    currentSchema: unknown;
    migrationStrategies: MigrationStrategies;
  }): Promise<Record<string, unknown>> {
    const storage = memoryEngineStorage();
    const dbName = `schema-migration-${(dbSeq += 1)}`;
    const old = await openCollection({
      schema: input.fixtureSchema,
      ...(input.fixtureMigrationStrategies ? { migrationStrategies: input.fixtureMigrationStrategies } : {}),
      storage,
      dbName,
    });
    await old.collection.insert(input.oldDocument);
    await old.db.close();

    const current = await openCollection({
      schema: input.currentSchema,
      migrationStrategies: input.migrationStrategies,
      storage,
      dbName,
    });
    const migrated = await current.collection.findOne(input.oldDocument.id as string).exec();
    expect(migrated).not.toBeNull();
    const json = migrated!.toJSON() as Record<string, unknown>;
    await current.db.close();
    return json;
  }

  it('orders v0 → v1 backfills the promoted filter/sort columns from the payload', async () => {
    const migrated = await migrate({
      fixtureSchema: {
        title: 'order v0 fixture',
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128 },
          wooOrderId: { type: ['number', 'null'] },
          payload: { type: 'object', additionalProperties: true },
          sync: { type: 'object', additionalProperties: true },
          local: { type: 'object', additionalProperties: true },
        },
        required: ['id', 'wooOrderId', 'payload', 'sync', 'local'],
      },
      oldDocument: {
        id: 'woo-order:42',
        wooOrderId: 42,
        payload: ORDER_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
      currentSchema: orderSchema,
      migrationStrategies: orderMigrationStrategies,
    });
    expect(migrated).toMatchObject(promotedOrderColumns(ORDER_PAYLOAD));
    expect(migrated.payload).toEqual(ORDER_PAYLOAD); // payload bytes untouched
  });

  it('products v0 → v2 runs BOTH strategies: promoted columns then decimal stockQuantity', async () => {
    const migrated = await migrate({
      fixtureSchema: {
        title: 'product v0 fixture',
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128 },
          wooProductId: { type: ['number', 'null'] },
          payload: { type: 'object', additionalProperties: true },
          sync: { type: 'object', additionalProperties: true },
          local: { type: 'object', additionalProperties: true },
        },
        required: ['id', 'wooProductId', 'payload', 'sync', 'local'],
      },
      oldDocument: {
        id: 'woo-product:9',
        wooProductId: 9,
        payload: PRODUCT_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
      currentSchema: productSchema,
      migrationStrategies: productMigrationStrategies,
    });
    expect(migrated).toMatchObject(promotedProductColumns(PRODUCT_PAYLOAD));
    expect(migrated.stockQuantity).toBe(3.6); // v1→v2 ran — decimal preserved, not int-coerced
    expect(migrated.payload).toEqual(PRODUCT_PAYLOAD);
  });

  it('products v1 → v2 in ISOLATION backfills stockQuantity (v0→v1 already sets it, so the chain alone cannot catch a broken strategy 2)', async () => {
    const { stockQuantity: _stockQuantity, ...v1Properties } = productSchema.properties;
    const v1Required = productSchema.required.filter((field) => field !== 'stockQuantity');
    const migrated = await migrate({
      fixtureSchema: {
        ...productSchema,
        title: 'product v1 fixture',
        version: 1,
        properties: v1Properties,
        required: v1Required,
      },
      // A fresh collection at version 1 needs a strategy per prior version;
      // the fixture stands in for a device already ON v1.
      fixtureMigrationStrategies: { 1: (doc) => doc },
      oldDocument: {
        id: 'woo-product:9',
        wooProductId: 9,
        ...(() => {
          const { stockQuantity: _promoted, ...v1Columns } = promotedProductColumns(PRODUCT_PAYLOAD);
          return v1Columns;
        })(),
        payload: PRODUCT_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
        local: { dirty: false, pendingMutationIds: [] },
      },
      currentSchema: productSchema,
      migrationStrategies: productMigrationStrategies,
    });
    expect(migrated.stockQuantity).toBe(3.6); // strategy 2 alone did this
  });

  it('variations v0 → v2 backfills promoted columns and null stockQuantity', async () => {
    const migrated = await migrate({
      fixtureSchema: {
        title: 'variation v0 fixture',
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128 },
          wooId: { type: ['number', 'null'] },
          parentId: { type: ['number', 'null'] },
          payload: { type: 'object', additionalProperties: true },
          sync: { type: 'object', additionalProperties: true },
        },
        required: ['id', 'wooId', 'parentId', 'payload', 'sync'],
      },
      oldDocument: {
        id: 'woo-variation:77',
        wooId: 77,
        parentId: 9,
        payload: VARIATION_PAYLOAD,
        sync: { revision: 'r1', partial: false, source: 'woo-rest' },
      },
      currentSchema: variationSchema,
      migrationStrategies: variationMigrationStrategies,
    });
    expect(migrated).toMatchObject(promotedVariationColumns(VARIATION_PAYLOAD));
    expect(migrated.stockQuantity).toBeNull(); // stock management off → null, not 0
    expect(migrated.payload).toEqual(VARIATION_PAYLOAD);
  });

  it('syncCheckpoints v0 → v1 keeps pre-epoch checkpoints valid (epoch stays absent)', async () => {
    const migrated = await migrate({
      fixtureSchema: {
        title: 'sync checkpoint v0 fixture',
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: {
          id: { type: 'string', maxLength: 128 },
          checkpoint: {
            type: 'object',
            properties: {
              updatedAtGmt: { type: 'string' },
              orderId: { type: 'number' },
              revision: { type: 'string' },
              sequence: { type: 'number' },
            },
            required: ['updatedAtGmt', 'orderId', 'revision', 'sequence'],
          },
          updatedAt: { type: 'string' },
        },
        required: ['id', 'checkpoint', 'updatedAt'],
      },
      oldDocument: {
        id: 'orders:custom-pull',
        checkpoint: { updatedAtGmt: '2026-07-01T10:00:00', orderId: 42, revision: 'r1', sequence: 3 },
        updatedAt: '2026-07-01T10:00:01.000Z',
      },
      currentSchema: syncCheckpointSchema,
      migrationStrategies: syncCheckpointMigrationStrategies,
    });
    expect(migrated.checkpoint).toEqual({ updatedAtGmt: '2026-07-01T10:00:00', orderId: 42, revision: 'r1', sequence: 3 });
    expect('epoch' in migrated).toBe(false); // pre-F8 checkpoint = never-seen epoch
  });

  it('mutation queue v1 → v2 synthesizes seq (queuedAt order preserved) and status pending (#507 regression 8)', async () => {
    // The pre-#507 durable queue schema: no seq/status/conflict fields.
    const v1FixtureSchema = {
      title: 'record mutation queue v1 fixture',
      version: 1,
      primaryKey: 'mutationId',
      type: 'object',
      properties: {
        mutationId: { type: 'string', maxLength: 64 },
        recordId: { type: 'string', maxLength: 64 },
        collectionName: { type: 'string', maxLength: 64 },
        operation: { type: 'string', enum: ['create', 'update', 'delete'] },
        origin: { type: 'string', enum: ['existing', 'server-meta', 'minted'] },
        payload: { type: 'object', additionalProperties: true },
        baseRevision: { type: ['string', 'null'] },
        queuedAt: { type: 'string', maxLength: 32 },
        attempts: { type: 'number', minimum: 0, maximum: 1_000_000, multipleOf: 1 },
        nextAttemptAt: { type: 'string', maxLength: 32 },
      },
      required: ['mutationId', 'recordId', 'collectionName', 'operation', 'payload', 'queuedAt'],
    };
    const v1Row = (mutationId: string, queuedAt: string) => ({
      mutationId,
      recordId: 'rec-A',
      collectionName: 'orders',
      operation: 'update',
      origin: 'existing',
      payload: { status: 'completed' },
      baseRevision: 'sha256:r1',
      queuedAt,
      attempts: 1,
      nextAttemptAt: '2026-07-01T10:05:00.000Z',
    });

    const storage = memoryEngineStorage();
    const dbName = `schema-migration-${(dbSeq += 1)}`;
    const old = await openCollection({
      schema: v1FixtureSchema,
      migrationStrategies: { 1: (doc) => doc },
      storage,
      dbName,
    });
    // Adversarial ids: the EARLIER row's id sorts last lexicographically.
    await old.collection.insert(v1Row('zz-early', '2026-07-01T10:00:00.000Z'));
    await old.collection.insert(v1Row('aa-late', '2026-07-01T10:00:01.000Z'));
    await old.db.close();

    const current = await openCollection({
      schema: recordMutationQueueSchema,
      migrationStrategies: recordMutationQueueMigrationStrategies as unknown as MigrationStrategies,
      storage,
      dbName,
    });
    const rows = (await current.collection.find().exec()).map((doc) => doc.toJSON() as unknown as QueuedMutation);
    await current.db.close();

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('pending');
      expect(row.seq).toBeGreaterThan(0);
      expect(row).toMatchObject({ baseRevision: 'sha256:r1', attempts: 1 }); // v1 fields survive untouched
    }
    const early = rows.find((row) => row.mutationId === 'zz-early')!;
    const late = rows.find((row) => row.mutationId === 'aa-late')!;
    expect(early.seq!).toBeLessThan(late.seq!); // queuedAt order preserved despite adversarial ids
  });
});

describe('reference schema identity — a recorded decision, not an accident (ADR 0019)', () => {
  it('the four reference schemas are byte-identical apart from title', () => {
    const shapeOf = ({ title: _title, ...shape }: { title: string }) => shape;
    const category = shapeOf(categorySchema);
    expect(shapeOf(brandSchema)).toEqual(category);
    expect(shapeOf(tagSchema)).toEqual(category);
    expect(shapeOf(couponSchema)).toEqual(category);
    // Deliberate divergence is an edit to THIS test plus ADR 0019's log —
    // that friction is the point; silent drift is what this catches.
  });
});
