import type { QueryTotalCacheEntry } from '../scheduler/query-total-requests';
import type { QueryTotalCacheDocument } from '../scheduler/query-total-cache-schema';
import { createRxKeyedRepository, type RxKeyedCollection } from './rx-keyed-repository';

function toDocument(entry: QueryTotalCacheEntry): QueryTotalCacheDocument {
  return { ...entry, schemaVersion: 1 };
}

function fromDocument(document: QueryTotalCacheDocument): QueryTotalCacheEntry {
  const { schemaVersion: _schemaVersion, ...entry } = document;
  return entry;
}

/** Structural: any database carrying the queryTotalCacheEntries collection (LabDatabase and engine scope dbs both satisfy it). */
export type QueryTotalCacheDatabase = { queryTotalCacheEntries: RxKeyedCollection<QueryTotalCacheDocument> };

export class RxQueryTotalCacheRepository {
  private readonly keyed;

  constructor(db: QueryTotalCacheDatabase) {
    this.keyed = createRxKeyedRepository({
      collection: db.queryTotalCacheEntries,
      keyOf: (entry: QueryTotalCacheEntry) => entry.queryKey,
      toDocument,
      fromDocument,
    });
  }

  async upsert(entry: QueryTotalCacheEntry): Promise<void> {
    await this.keyed.upsert(entry);
  }

  async readFresh(nowMs: number): Promise<QueryTotalCacheEntry[]> {
    return this.keyed.readMany({
      selector: { freshUntilMs: { $gt: nowMs } },
      sort: [{ queryKey: 'asc' }],
    });
  }
}
