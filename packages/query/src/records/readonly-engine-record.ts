import type { EngineRecord, EngineRecordCollectionName } from './engine-record';
import type { Reactified } from 'rxdb';
import type { Observable } from 'rxjs';

/** Named reads retain RxDB's live record identity, but never its write/storage doors. */
export type ReadonlyEngineRecord<C extends EngineRecordCollectionName> = Omit<
	EngineRecord<C>,
	| 'patch'
	| 'update'
	| 'modify'
	| 'remove'
	| 'set'
	| 'save'
	| 'close'
	| `incremental${string}`
	| `atomic${string}`
	| `_${string}`
	| 'updateCRDT'
	| 'collection'
	| '$emit'
	| 'populate'
	| `putAttachment${string}`
	| 'getAttachment'
	| 'allAttachments'
	| 'allAttachments$'
	| 'getLatest'
	| '$'
	| '$$'
> & {
	getLatest(): ReadonlyEngineRecord<C>;
	readonly $: Observable<ReadonlyEngineRecord<C>>;
	readonly $$: Reactified<unknown, ReadonlyEngineRecord<C>>;
};
