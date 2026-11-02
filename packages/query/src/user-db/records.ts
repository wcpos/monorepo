import type {
	SiteDocument,
	StoreDocument,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';

import type { Reactified } from 'rxdb';
import type { Observable } from 'rxjs';

/** RxDB instances retain their identity, with storage and write doors omitted. */
type ReadonlyUserDbRecord<D> = Omit<
	D,
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
	| `populate${string}`
	| 'get$'
	| 'get$$'
	| `putAttachment${string}`
	| 'getAttachment'
	| 'allAttachments'
	| 'allAttachments$'
	| 'getLatest'
	| '$'
	| '$$'
> & {
	getLatest(): ReadonlyUserDbRecord<D>;
	readonly $: Observable<ReadonlyUserDbRecord<D>>;
	readonly $$: Reactified<unknown, ReadonlyUserDbRecord<D>>;
};

export type ReadonlySiteRecord = ReadonlyUserDbRecord<SiteDocument>;
export type ReadonlyStoreRecord = ReadonlyUserDbRecord<StoreDocument>;
export type ReadonlyUserRecord = ReadonlyUserDbRecord<UserDocument>;
export type ReadonlyWpCredentialsRecord = ReadonlyUserDbRecord<WPCredentialsDocument>;
export type ReadonlyUserDatabaseRecord =
	ReadonlySiteRecord | ReadonlyStoreRecord | ReadonlyUserRecord | ReadonlyWpCredentialsRecord;
