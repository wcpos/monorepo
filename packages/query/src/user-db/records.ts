import type {
	SiteDocument,
	StoreDocument,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';

import type { ObservableResource } from 'observable-hooks';
import type { Reactified } from 'rxdb';
import type { Observable } from 'rxjs';

/** RxDB instances retain their identity, with storage and write doors omitted. */
type ReadonlyUserDbRecord<D, Links = Record<never, never>> = Omit<
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
	getLatest(): ReadonlyUserDbRecord<D, Links>;
	readonly $: Observable<ReadonlyUserDbRecord<D, Links>>;
	readonly $$: Reactified<unknown, ReadonlyUserDbRecord<D, Links>>;
	populate<K extends keyof Links>(key: K): Promise<Links[K][]>;
	populate$<K extends keyof Links>(key: K): Observable<Links[K][]>;
	populateResource<K extends keyof Links>(key: K): ObservableResource<Links[K][]>;
};

export type ReadonlySiteRecord = ReadonlyUserDbRecord<
	SiteDocument,
	{ wp_credentials: ReadonlyWpCredentialsRecord }
>;
export type ReadonlyStoreRecord = ReadonlyUserDbRecord<StoreDocument>;
export type ReadonlyUserRecord = ReadonlyUserDbRecord<UserDocument, { sites: ReadonlySiteRecord }>;
export type ReadonlyWpCredentialsRecord = ReadonlyUserDbRecord<
	WPCredentialsDocument,
	{ stores: ReadonlyStoreRecord }
>;
export type ReadonlyUserDatabaseRecord =
	ReadonlySiteRecord | ReadonlyStoreRecord | ReadonlyUserRecord | ReadonlyWpCredentialsRecord;
