import { chunk } from '../scheduler/chunk';
import { existenceManifestDocument, type ExistenceManifestDocument } from './existence-manifest-schema';
import { upsertManifestRows } from './rx-existence-manifest-repository';

/** Structural collection slices the primes read — LabDatabase and engine scope dbs both satisfy them. */
type CountFindCollection<TDoc> = {
  count(): { exec(): Promise<number> };
  find(): { exec(): Promise<TDoc[]> };
};
type PrimeManifestCollection = {
  bulkUpsert(docs: ExistenceManifestDocument[]): Promise<unknown>;
  bulkRemove(ids: string[]): Promise<unknown>;
  count(): { exec(): Promise<number> };
  find(query?: unknown): { exec(): Promise<Array<{ toJSON(): ExistenceManifestDocument; wooId: number }>> };
};

/** Structural: the collections the boot primes touch. */
export type ExistenceManifestPrimeDatabase = {
  existenceManifest: PrimeManifestCollection;
  existenceManifestCustomers: PrimeManifestCollection;
  existenceManifestOrders: PrimeManifestCollection;
  products: CountFindCollection<{ wooProductId?: number | null }>;
  variations: CountFindCollection<{ wooId?: number | null }>;
  customers: CountFindCollection<{ wooCustomerId?: number | null }>;
  orders: CountFindCollection<{ toJSON(): unknown }>;
};


/**
 * Leg-3 prime pass (ADR 0014 increment 4c-client). Records synced BEFORE Leg 3 shipped carry no
 * existenceManifest row; without this backfill the first reconcile audit would read every such id as a
 * server-vs-local mismatch and re-pull the whole catalog. This seeds their manifest rows directly from
 * the compact GET /digests endpoint (no payloads). Digest-on-pull covers records pulled AFTER Leg 3;
 * this covers the pre-existing resident set. A one-shot at boot, guarded by a cheap count so it does
 * NOT re-read the catalog once the manifest is primed.
 */

export type DigestFetch = (ids: number[]) => Promise<Array<{ id: number; digest: string }>>;

/**
 * Pure core: given the local product/variation id sets, the manifest ids already present, and injected
 * fetch/upsert, backfill manifest rows for the MISSING ids in chunks. Returns the number of rows primed.
 */
export async function runManifestPrimePass(input: {
  productWooIds: readonly number[];
  variationWooIds: readonly number[];
  existingManifestWooIds: ReadonlySet<number>;
  fetchDigests: DigestFetch;
  upsert: (rows: ExistenceManifestDocument[]) => Promise<void>;
  chunkSize?: number;
}): Promise<number> {
  // wp_posts ids never collide across products/variations, so a single lane map is unambiguous; the
  // objectType a returned id gets comes from whichever local set it belongs to.
  const laneOf = new Map<number, 'product' | 'variation'>();
  for (const id of input.productWooIds) {
    laneOf.set(id, 'product');
  }
  for (const id of input.variationWooIds) {
    if (!laneOf.has(id)) {
      laneOf.set(id, 'variation');
    }
  }

  const missing: number[] = [];
  for (const id of laneOf.keys()) {
    if (!input.existingManifestWooIds.has(id)) {
      missing.push(id);
    }
  }
  if (missing.length === 0) {
    return 0;
  }

  let primed = 0;
  for (const batch of chunk(missing, input.chunkSize ?? 100)) {
    const digests = await input.fetchDigests(batch);
    const rows: ExistenceManifestDocument[] = [];
    for (const { id, digest } of digests) {
      const objectType = laneOf.get(id);
      if (!objectType || typeof digest !== 'string' || digest === '') {
        continue; // an id we didn't ask about, or a record with no stored digest yet
      }
      rows.push(existenceManifestDocument({ wooId: id, objectType, digest }));
    }
    if (rows.length > 0) {
      await input.upsert(rows);
      primed += rows.length;
    }
  }
  return primed;
}

type PrimeFetcher = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Wiring: read the local id sets + existing manifest ids, gate on a cheap count, and run the prime pass
 * against the live GET /digests endpoint. The count-gate short-circuits the expensive full-document read
 * once every resident record has a manifest row (the steady state after the first successful prime).
 *
 * Caveat: locally-born products (no server wooProductId) are excluded from the prime (not part of the
 * server's set) but still count toward `products.count()`, so their presence can keep the gate open and
 * re-read on boot. Rare for a POS (it seldom authors products); a persisted one-shot marker is the robust
 * follow-up. Correctness never depends on the gate — the pass only ever primes server ids missing locally.
 */
export async function primeExistenceManifest(
  db: ExistenceManifestPrimeDatabase,
  input: { fetcher: PrimeFetcher; syncBaseUrl: string; chunkSize?: number },
): Promise<number> {
  const [manifestCount, productCount, variationCount] = await Promise.all([
    db.existenceManifest.count().exec(),
    db.products.count().exec(),
    db.variations.count().exec(),
  ]);
  if (manifestCount >= productCount + variationCount) {
    return 0;
  }

  const [manifestDocs, productDocs, variationDocs] = await Promise.all([
    db.existenceManifest.find().exec(),
    db.products.find().exec(),
    db.variations.find().exec(),
  ]);
  const existingManifestWooIds = new Set<number>(manifestDocs.map((doc) => doc.wooId));
  const productWooIds = productDocs
    .map((doc) => doc.wooProductId)
    .filter((id): id is number => typeof id === 'number' && id > 0);
  const variationWooIds = variationDocs
    .map((doc) => doc.wooId)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const fetchDigests: DigestFetch = async (ids) => {
    const response = await input.fetcher(`${input.syncBaseUrl}/digests?include=${ids.join(',')}`);
    if (!response.ok) {
      throw new Error(`digests prime fetch failed: ${response.status}`);
    }
    const body = (await response.json()) as { digests?: Array<{ id: number; digest: string }> };
    return body.digests ?? [];
  };

  return runManifestPrimePass({
    productWooIds,
    variationWooIds,
    existingManifestWooIds,
    fetchDigests,
    upsert: (rows) => upsertManifestRows(db.existenceManifest, rows),
    chunkSize: input.chunkSize,
  });
}

/**
 * Single-lane prime (ADR 0015): backfill manifest rows for the MISSING wooIds of ONE id-space/objectType.
 * Customers (and later orders) are a single lane over their own manifest collection, unlike the
 * products+variations two-lane pass over the shared wp_posts space. Digests are matched to the batch we
 * asked about, so a stray server id never seeds a row.
 */
export async function runSingleLanePrimePass(input: {
  wooIds: readonly number[];
  objectType: 'product' | 'variation' | 'customer' | 'order';
  existingManifestWooIds: ReadonlySet<number>;
  fetchDigests: DigestFetch;
  upsert: (rows: ExistenceManifestDocument[]) => Promise<void>;
  chunkSize?: number;
}): Promise<number> {
  const missing = [...new Set(input.wooIds)].filter((id) => !input.existingManifestWooIds.has(id));
  if (missing.length === 0) {
    return 0;
  }
  let primed = 0;
  for (const batch of chunk(missing, input.chunkSize ?? 100)) {
    const batchSet = new Set(batch);
    const digests = await input.fetchDigests(batch);
    const rows: ExistenceManifestDocument[] = [];
    for (const { id, digest } of digests) {
      if (!batchSet.has(id) || typeof digest !== 'string' || digest === '') {
        continue;
      }
      rows.push(existenceManifestDocument({ wooId: id, objectType: input.objectType, digest }));
    }
    if (rows.length > 0) {
      await input.upsert(rows);
      primed += rows.length;
    }
  }
  return primed;
}

/**
 * Customer boot prime (ADR 0015): backfill existenceManifestCustomers for customers resident before the
 * customer reconcile existed, so the first customer audit doesn't re-pull the whole customer base. Its OWN
 * collection + id-space (wp_users) — never touches the product manifest. Count-gated like the product prime.
 */
export async function primeExistenceManifestCustomers(
  db: ExistenceManifestPrimeDatabase,
  input: { fetcher: PrimeFetcher; syncBaseUrl: string; chunkSize?: number },
): Promise<number> {
  const [manifestCount, customerCount] = await Promise.all([
    db.existenceManifestCustomers.count().exec(),
    db.customers.count().exec(),
  ]);
  if (manifestCount >= customerCount) {
    return 0;
  }

  const [manifestDocs, customerDocs] = await Promise.all([
    db.existenceManifestCustomers.find().exec(),
    db.customers.find().exec(),
  ]);
  const existingManifestWooIds = new Set<number>(manifestDocs.map((doc) => doc.wooId));
  const customerWooIds = customerDocs
    .map((doc) => doc.wooCustomerId)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const fetchDigests: DigestFetch = async (ids) => {
    const response = await input.fetcher(`${input.syncBaseUrl}/digests?include=${ids.join(',')}&collection=customers`);
    if (!response.ok) {
      throw new Error(`customer digests prime fetch failed: ${response.status}`);
    }
    const body = (await response.json()) as { digests?: Array<{ id: number; digest: string }> };
    return body.digests ?? [];
  };

  return runSingleLanePrimePass({
    wooIds: customerWooIds,
    objectType: 'customer',
    existingManifestWooIds,
    fetchDigests,
    upsert: (rows) => upsertManifestRows(db.existenceManifestCustomers, rows),
    chunkSize: input.chunkSize,
  });
}

/**
 * Order boot prime (ADR 0015): backfill existenceManifestOrders for orders resident before the order
 * reconcile existed, so the first order audit doesn't re-pull the whole order backlog. Its OWN collection
 * + id-space (HPOS/CPT order ids). Count-gated like the customer prime.
 */
export async function primeExistenceManifestOrders(
  db: ExistenceManifestPrimeDatabase,
  input: { fetcher: PrimeFetcher; syncBaseUrl: string; chunkSize?: number },
): Promise<number> {
  const [manifestCount, orderCount] = await Promise.all([
    db.existenceManifestOrders.count().exec(),
    db.orders.count().exec(),
  ]);
  if (manifestCount >= orderCount) {
    return 0;
  }

  const [manifestDocs, orderDocs] = await Promise.all([
    db.existenceManifestOrders.find().exec(),
    db.orders.find().exec(),
  ]);
  const existingManifestWooIds = new Set<number>(manifestDocs.map((doc) => doc.wooId));
  const orderWooIds = orderDocs
    .map((doc) => (doc.toJSON() as { wooOrderId?: number | null }).wooOrderId)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const fetchDigests: DigestFetch = async (ids) => {
    const response = await input.fetcher(`${input.syncBaseUrl}/digests?include=${ids.join(',')}&collection=orders`);
    if (!response.ok) {
      throw new Error(`order digests prime fetch failed: ${response.status}`);
    }
    const body = (await response.json()) as { digests?: Array<{ id: number; digest: string }> };
    return body.digests ?? [];
  };

  return runSingleLanePrimePass({
    wooIds: orderWooIds,
    objectType: 'order',
    existingManifestWooIds,
    fetchDigests,
    upsert: (rows) => upsertManifestRows(db.existenceManifestOrders, rows),
    chunkSize: input.chunkSize,
  });
}
