import type { StoreDocument } from '@wcpos/database';

import { applyLocalPatch } from './local-patch';
import { enqueueRecordWrite, pushRecord } from './push-record';

import type { QueryRuntime } from '../provider';
import type { EngineRecord } from '../records/engine-record';
import type { ReadonlyEngineRecord } from '../records/readonly-engine-record';
import type { MutationDocument } from './resident';

declare const runtime: QueryRuntime;
declare const readonlyOrder: ReadonlyEngineRecord<'orders'>;
declare const order: EngineRecord<'orders'>;
declare const identity: { uuid: string; isNew: boolean };
declare const store: StoreDocument;
void applyLocalPatch(runtime, { document: readonlyOrder, data: { customer_note: 'x' } });
void applyLocalPatch(runtime, { document: order, data: {} }); // existing callers still compile
void applyLocalPatch(runtime, { document: identity, data: {} }, { collectionName: 'orders' });
void pushRecord(runtime, readonlyOrder);
void enqueueRecordWrite(runtime, readonlyOrder);
const asReadonly: ReadonlyEngineRecord<'orders'> = order; // per-screen migration precondition
void asReadonly;
// @ts-expect-error a bare object with no record identity is not a write target
const a: MutationDocument = { id: 'store_1' };
// @ts-expect-error a store document has no write door
const b: MutationDocument = store;
void [a, b];
// @ts-expect-error the push doors cannot serve an identity: it carries no collection
void pushRecord(runtime, identity);
