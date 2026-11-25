import { defer, distinctUntilChanged, map, type Observable, of, startWith, switchMap } from 'rxjs';

import type {
	SiteDocument,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';

import type {
	ReadonlySiteRecord,
	ReadonlyStoreRecord,
	ReadonlyUserRecord,
	ReadonlyWpCredentialsRecord,
} from './records';

/**
 * Declared absent value for record-bound auth reads, not a settled empty list.
 * Every subscription (including a source rebind) starts pending, exactly once;
 * a core identity-keyed ObservableResource must ignore it until the first answer.
 * Sources are non-nullable: callers only build a read when they have a record.
 * These userDB records are not engine residents; rebinding means subscribing to
 * the new record's read, not following the store engine's collection lifecycle.
 */
export const PENDING_USER_DB_READ = Symbol('pending-user-db-read');

/** User's sites in link order, with RxDB document identity preserved. */
export function observeUserSites(
	user: ReadonlyUserRecord | UserDocument
): Observable<ReadonlySiteRecord[] | typeof PENDING_USER_DB_READ> {
	return defer(() => (user as UserDocument).populate$('sites')).pipe(
		map((sites) => {
			const ids = user.getLatest().sites ?? [];
			return [...(sites as ReadonlySiteRecord[])].sort(
				(a, b) => ids.indexOf(a.uuid!) - ids.indexOf(b.uuid!)
			);
		}),
		startWith(PENDING_USER_DB_READ)
	);
}

/** Same ids in the same order; a document patch that leaves the id list alone is not a relink. */
function sameIdList(a: unknown, b: unknown): boolean {
	return (
		Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, i) => id === b[i])
	);
}

function linkedIds(ids: unknown): string[] {
	return Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
}

/**
 * Site credentials in link order; pending first, then [] for no linked credentials.
 * A live find($in), unlike populate$, re-emits when a linked document changes
 * (a cashier rename), so every name read through this door follows it.
 */
export function observeSiteCredentials(
	site: ReadonlySiteRecord | SiteDocument
): Observable<ReadonlyWpCredentialsRecord[] | typeof PENDING_USER_DB_READ> {
	return defer(() => {
		const document = site as SiteDocument;
		return document.get$('wp_credentials').pipe(
			distinctUntilChanged(sameIdList),
			switchMap((ids) => {
				const validIds = linkedIds(ids);
				if (validIds.length === 0) return of<ReadonlyWpCredentialsRecord[]>([]);
				return document.collection.database.wp_credentials
					.find({ selector: { uuid: { $in: validIds } } })
					.$.pipe(
						map((credentials) =>
							[...(credentials as ReadonlyWpCredentialsRecord[])].sort(
								(a, b) => validIds.indexOf(a.uuid!) - validIds.indexOf(b.uuid!)
							)
						)
					);
			})
		);
	}).pipe(startWith(PENDING_USER_DB_READ));
}

/**
 * Pending first on each binding, then only database answers (including empty lists).
 * A live find($in), unlike populate$/findByIds, observes late store inserts.
 * Sorting and display-field deduplication belong to the picker in core.
 */
export function observeCredentialStores(
	credentials: ReadonlyWpCredentialsRecord | WPCredentialsDocument
): Observable<ReadonlyStoreRecord[] | typeof PENDING_USER_DB_READ> {
	return defer(() => {
		const document = credentials as WPCredentialsDocument;
		return document.get$('stores').pipe(
			distinctUntilChanged(sameIdList),
			switchMap((ids) => {
				const validIds = linkedIds(ids);
				if (validIds.length === 0) return of<ReadonlyStoreRecord[]>([]);
				return document.collection.database.stores.find({
					selector: { localID: { $in: validIds } },
				}).$;
			})
		);
	}).pipe(startWith(PENDING_USER_DB_READ));
}

export function observeStoreByRemoteId(
	userDB: UserDatabase,
	id: number
): Observable<ReadonlyStoreRecord | undefined> {
	return userDB.stores
		.findOne({ selector: { id } })
		.$.pipe(map((store) => (store as unknown as ReadonlyStoreRecord) ?? undefined));
}

export async function readSiteApiUrls(
	userDB: UserDatabase
): Promise<Pick<ReadonlySiteRecord, 'uuid' | 'wp_api_url'>[]> {
	const sites = await userDB.sites.find().exec();
	return sites.map(({ uuid, wp_api_url }) => ({ uuid, wp_api_url }));
}
