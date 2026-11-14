import { combineLatest, defer, map, shareReplay } from 'rxjs';

import type { UserDatabase } from '@wcpos/database';
import { readLedger } from '@wcpos/order-math';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { afterBaseline, baselineContains, outsideBaseline } from './baseline';
import {
	currentSession,
	isSessionOrder,
	refusedCashOf,
	unaccepted,
	unsyncedCount,
} from './drawer-rules';
import { deriveDrawerTerms, deriveExpected } from './expected';
import {
	observeCashMovements,
	observeRegisterClosures,
	observeRegisterSessions,
	observeSessionAccounting,
} from './reads';
import { observeRegister$, type RegisterDocument } from './register-document';

import type { Observable, ObservedValueOf } from 'rxjs';
import type { RegisterStoreDatabase } from './store-database';

type SessionRows = NonNullable<ObservedValueOf<ReturnType<typeof observeRegisterSessions>>>;
type Accounting = NonNullable<ObservedValueOf<ReturnType<typeof observeSessionAccounting>>>;
type Movements = NonNullable<ObservedValueOf<ReturnType<typeof observeCashMovements>>>;
type Closures = NonNullable<ObservedValueOf<ReturnType<typeof observeRegisterClosures>>>;

type StoreDB = NonNullable<RegisterStoreDatabase> & { name?: string };
export type DrawerContext = {
	storeDB: StoreDB;
	userDB: UserDatabase;
	siteUuid: string;
	engine: RxdbSyncEngine;
};

/** One register's drawer, derived once from its reads: every surface reads these figures. */
function deriveDrawer(
	{ storeDB, siteUuid }: DrawerContext,
	registerId: string,
	[rows, all, accounting, closures, register]: [
		SessionRows,
		Movements,
		Accounting,
		Closures,
		RegisterDocument | null,
	]
) {
	const session = currentSession(rows, closures);
	/**
	 * The store refused this till's close (#2016): the close came back `failed` and no refresh
	 * has reached the store (a), or the session is at counting or open with this till's closure
	 * still unaccepted (b): the store's row reopened it at counting, or the cashier went back to
	 * selling, refused or not. A refused override is `approval_required`, not this.
	 */
	const refusedClose =
		!!session &&
		((session.status === 'closed' && session.sync_status === 'failed') ||
			(['counting', 'open'].includes(session.status) &&
				!session.approval_required &&
				session.server_status !== 'closed' &&
				unaccepted(closures.find((row) => row.id === session.id))));
	const movements = all.filter((row) => row.session_id === session?.id);
	// The pane's refused movements, by REGISTER (pos/cart LEDGER line 57): they outlive their session.
	const registerSessionIds = new Set([...rows.active, ...rows.closed].map((row) => row.id));
	const refusedMovements = all.filter(
		(row) => row.sync_status === 'failed' && registerSessionIds.has(row.session_id)
	);
	// The closure row's refused cash, by SESSION: what the count asks the cashier to acknowledge.
	const refusedCash = refusedCashOf(movements);
	const records = accounting.orders.hits.map(({ record }) => record);
	const orders = session ? records.filter((record) => isSessionOrder(record, session.id)) : [];
	const drawerInput = session
		? {
				session,
				movements,
				// Each row keeps its order, so a split cash payment counts as one cash sale.
				ledgerRowsBySession: records.flatMap((record) =>
					readLedger(record.payload.meta_data).map((row) => ({ ...row, order: record.uuid }))
				),
				refundRecords: accounting.refundRecords,
			}
		: undefined;
	const baselineHas = baselineContains(records, accounting.refundSources, movements, session);
	// Snapshot-counted voids debit the baseline even offline. Other in-place edits keep the
	// baseline plus deltas until refreshed rather than inventing their prior state. Compare each
	// row's snapshot version; older plugins fall back to the snapshot time.
	const versions = [...(session?.server_ledger_rows ?? []), ...(session?.server_refunds ?? [])];
	const baselineVersion = (id: string | number | undefined) =>
		versions.find((row) => row.id === id)?.updated_at_gmt ?? session?.server_expected_at;
	const baselineStale =
		!!drawerInput?.ledgerRowsBySession.some((row) => {
			if (!baselineHas?.(row.id)) return false;
			const snapshot = session?.server_ledger_rows?.find(({ id }) => id === row.id);
			// Tokens are server-owned: compare them, never reconstruct their financial hash.
			return snapshot?.version !== undefined
				? row.version !== snapshot.version
				: afterBaseline(row.updated_at_gmt, baselineVersion(row.id));
		}) ||
		accounting.refundRecords.some(
			(row) =>
				baselineHas?.(row.id) && afterBaseline(row.date_modified_gmt, baselineVersion(row.id))
		);
	// The emitted document, never the writer's cache: a snapshot can precede its assignment.
	const bucket = register?.sites[siteUuid]?.registers?.[registerId];
	const live = bucket?.live;
	const lastClosure =
		[...closures].sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0] ?? null;
	const serverOrderIds =
		session?.server_order_ids != null
			? new Set(session.server_order_ids)
			: session?.server_order_ids;
	return {
		session,
		refusedClose,
		movements,
		refusedMovements,
		refusedCash,
		expected: drawerInput ? deriveExpected(drawerInput, baselineHas) : {},
		// The same anchor as `expected`, so the strip's terms add up to its total.
		terms: drawerInput ? deriveDrawerTerms(drawerInput, baselineHas) : undefined,
		/** The server's snapshot no longer matches a row it counted: ask the bridge to refresh. */
		baselineStale,
		unsyncedCount: session ? unsyncedCount(session, orders, movements) : 0,
		salesCount:
			session?.server_sales_count != null && session.server_expected_at != null
				? session.server_sales_count +
					orders.filter((record) =>
						outsideBaseline(record, session.server_expected_at, serverOrderIds)
					).length
				: orders.length,
		/** § 4.9 invariant 1: a seeded session's figures are unknown until the server's baseline. */
		figuresPending:
			!!session &&
			session.server_expected_at == null &&
			!!live?.seeded_in.includes(storeDB.name ?? ''),
		/** This device owns the cached count mark, not another till. */
		countingHere: !!live?.counting_here,
		// The refresh clears the live record as the remote close lands; the marker outlives it.
		closedElsewhere:
			!session && lastClosure && bucket?.closed_elsewhere?.session_id === lastClosure.id
				? { by: lastClosure.closed_by, at: lastClosure.closed_at }
				: null,
		lastClosure,
		lastClosed:
			[...rows.closed].sort((a, b) =>
				(b.closed_at_gmt ?? '').localeCompare(a.closed_at_gmt ?? '')
			)[0] ?? null,
		/** An old render may outlive a replacement collection's first answer. */
		isCurrent: rows.isCurrent,
	};
}
export type RegisterDrawer = ReturnType<typeof deriveDrawer>;

const shared = new WeakMap<object, Map<string, { deps: unknown[]; stream: Observable<unknown> }>>();
/** One stream per store database and key, rebuilt when a dependency is replaced. */
function sharedRead<T>(
	storeDB: StoreDB,
	key: string,
	deps: unknown[],
	build: () => Observable<T>
): Observable<T> {
	let streams = shared.get(storeDB);
	if (!streams) shared.set(storeDB, (streams = new Map()));
	const held = streams.get(key);
	if (held && held.deps.every((dep, index) => dep === deps[index]))
		return held.stream as Observable<T>;
	const stream = defer(build).pipe(shareReplay({ bufferSize: 1, refCount: true }));
	streams.set(key, { deps, stream });
	return stream;
}

/** The register's drawer, one snapshot shared per register; null until every read answers. */
export function observeRegisterDrawer(
	ctx: DrawerContext,
	registerId: string
): Observable<RegisterDrawer | null> {
	const { storeDB, userDB, siteUuid, engine } = ctx;
	return sharedRead(storeDB, `drawer:${siteUuid}:${registerId}`, [engine, userDB], () => {
		const sessions$ = observeRegisterSessions(storeDB, registerId);
		const closures$ = observeRegisterClosures(storeDB, registerId);
		// The current session's accounting, so a refused abandon's retry has its sales.
		const accounting$ = observeSessionAccounting(
			engine,
			combineLatest([sessions$, closures$]).pipe(
				map(([rows, closures]) =>
					rows && closures ? (currentSession(rows, closures) ?? undefined) : null
				)
			)
		);
		return combineLatest([
			sessions$,
			observeCashMovements(storeDB),
			accounting$,
			closures$,
			observeRegister$(userDB),
		]).pipe(
			map(([rows, movements, accounting, closures, register]) =>
				rows && movements && accounting && closures
					? deriveDrawer(ctx, registerId, [rows, movements, accounting, closures, register])
					: null
			)
		);
	});
}

/** The register's current session alone, by the same rule, for a surface that reads its status. */
export function observeRegisterStatus(storeDB: StoreDB, registerId: string) {
	return sharedRead(storeDB, `status:${registerId}`, [], () =>
		combineLatest([
			observeRegisterSessions(storeDB, registerId),
			observeRegisterClosures(storeDB, registerId),
		]).pipe(
			map(([rows, closures]) =>
				rows && closures
					? { session: currentSession(rows, closures), isCurrent: rows.isCurrent }
					: null
			)
		)
	);
}
