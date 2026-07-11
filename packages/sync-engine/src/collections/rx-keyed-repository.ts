import { assertBulkSuccess } from '@woo-rxdb-lab/sync-core';
export type RxKeyedDocument<TDocument extends object> = {
  toJSON(withRevAndAttachments?: boolean): unknown;
  incrementalModify?(mutationFunction: (document: TDocument & { _deleted?: boolean }) => TDocument | (TDocument & { _deleted?: boolean }) | Promise<TDocument | (TDocument & { _deleted?: boolean })>): Promise<unknown>;
};

export type RxKeyedCollection<TDocument extends object> = {
  insert(item: TDocument): Promise<unknown>;
  bulkUpsert(items: TDocument[]): Promise<unknown>;
  find(query?: MangoQuery<TDocument>): { exec(): Promise<Array<RxKeyedDocument<TDocument> | TDocument>> };
  findOne(documentId: string): { exec(includeDeleted?: boolean): Promise<RxKeyedDocument<TDocument> | null> };
};

type Options<TValue, TDocument extends object> = {
  collection: RxKeyedCollection<TDocument>;
  keyOf(value: TValue): string;
  toDocument(value: TValue): TDocument;
  fromDocument(document: TDocument): TValue;
};

type MaybeConflictError = { code?: string; status?: number };

export function isRxConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as MaybeConflictError;
  return candidate.code === 'CONFLICT' || candidate.status === 409;
}

export function rxDocumentJson<TDocument extends object>(document: RxKeyedDocument<TDocument> | TDocument): TDocument {
  return document && typeof document === 'object' && 'toJSON' in document
    ? document.toJSON() as TDocument
    : document;
}

/** Shared storage mechanics for repositories keyed by one stable document id. */
export function createRxKeyedRepository<TValue, TDocument extends object>(options: Options<TValue, TDocument>) {
  const fromStored = (document: RxKeyedDocument<TDocument> | TDocument): TValue => options.fromDocument(rxDocumentJson(document));

  async function findDocument(key: string, includeDeleted = false): Promise<RxKeyedDocument<TDocument> | null> {
    return options.collection.findOne(key).exec(includeDeleted);
  }

  async function modifyIfCurrent(
    expected: TValue,
    same: (current: TValue, expected: TValue) => boolean,
    nextDocument: (current: TDocument & { _deleted?: boolean }) => TDocument & { _deleted?: boolean },
  ): Promise<boolean> {
    const document = await findDocument(options.keyOf(expected));
    if (!document?.incrementalModify) return false;

    let modified = false;
    await document.incrementalModify((currentDocument) => {
      // RxDB can invoke this callback again after a write conflict. The returned
      // verdict must describe the final revision, not an earlier attempt.
      modified = same(options.fromDocument(currentDocument), expected);
      return modified ? nextDocument(currentDocument) : currentDocument;
    });
    return modified;
  }

  return {
    async upsert(value: TValue): Promise<void> {
      assertBulkSuccess(await options.collection.bulkUpsert([options.toDocument(value)]), 'rx-keyed-repository upsert');
    },
    async insertIfAbsent(value: TValue): Promise<boolean> {
      try {
        await options.collection.insert(options.toDocument(value));
        return true;
      } catch (error: unknown) {
        if (isRxConflictError(error)) return false;
        throw error;
      }
    },
    async read(key: string, includeDeleted = false): Promise<TValue | null> {
      const document = await findDocument(key, includeDeleted);
      return document ? fromStored(document) : null;
    },
    async readMany(query?: MangoQuery<TDocument>): Promise<TValue[]> {
      const documents = await options.collection.find(query).exec();
      return documents.map(fromStored);
    },
    findDocument,
    async replaceIfCurrent(
      expected: TValue,
      next: TValue,
      same: (current: TValue, expected: TValue) => boolean,
      mergeDocument?: (current: TDocument & { _deleted?: boolean }, next: TDocument) => TDocument & { _deleted?: boolean },
    ): Promise<boolean> {
      if (options.keyOf(expected) !== options.keyOf(next)) return false;
      return modifyIfCurrent(expected, same, (current) => {
        const nextDocument = options.toDocument(next);
        return mergeDocument ? mergeDocument(current, nextDocument) : nextDocument;
      });
    },
    async removeIfCurrent(expected: TValue, same: (current: TValue, expected: TValue) => boolean): Promise<boolean> {
      return modifyIfCurrent(expected, same, (current) => ({ ...current, _deleted: true }));
    },
  };
}
import type { MangoQuery } from 'rxdb';
