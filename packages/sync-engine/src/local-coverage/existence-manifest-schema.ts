const maxSafeInteger = 9_007_199_254_740_991;

/**
 * A Leg-3 existence-reconcile manifest row (ADR 0014). The COMPACT `{wooId, digest}` the client
 * compares, bucket by bucket, against the server's stored-digest buckets — carrying NO payload, so
 * bucketing/hashing reads tiny rows instead of materializing the whole product catalog (the RxDB
 * review's headline killer). Populated as products/variations are pulled (they carry `_rxdb_digest`),
 * maintained on delete, and primed for resident records.
 */
export type ExistenceManifestDocument = {
  /** Primary key = String(wooId). wp_posts ids are globally unique across products + variations. */
  id: string;
  /** The numeric Woo id, INDEXED — the reconcile range-buckets on it. */
  wooId: number;
  /** Which pull lane owns this id, so a diff re-pulls the right path. */
  objectType: 'product' | 'variation' | 'customer' | 'order';
  /** The server's 64-bit digest as a decimal STRING (exceeds JS Number's safe range — ADR 0014 M1). */
  digest: string;
};

export const existenceManifestSchema = {
  title: 'Leg-3 existence-reconcile manifest',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 20 }, // wooId is at most maxSafeInteger (16 digits)
    // Indexed numeric id for range-bucket queries. RxDB can range-query an indexed NON-null number
    // field; the product payload's `wooProductId` is `number|null` (unindexable), which is exactly why
    // the manifest carries its own always-present numeric `wooId` rather than reusing the product doc.
    wooId: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
    objectType: { type: 'string', maxLength: 16 },
    digest: { type: 'string', maxLength: 24 }, // 64-bit unsigned is at most 20 decimal digits
  },
  required: ['id', 'wooId', 'objectType', 'digest'],
  indexes: ['wooId'],
} as const;

/** Build a manifest row from a pulled record's numeric id, lane, and server digest. */
export function existenceManifestDocument(input: {
  wooId: number;
  objectType: 'product' | 'variation' | 'customer' | 'order';
  digest: string;
}): ExistenceManifestDocument {
  return { id: String(input.wooId), wooId: input.wooId, objectType: input.objectType, digest: input.digest };
}
