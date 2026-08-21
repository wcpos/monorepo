import { isRxDocument } from 'rxdb';
import { defer, firstValueFrom, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, shareReplay, switchMap, tap } from 'rxjs/operators';

import { createTemporaryDB, type TemporaryOrderDocument } from '@wcpos/database';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const temporaryOrderLogger = getLogger(['wcpos', 'pos', 'temporary-order']);

/**
 * The ONE owner of raw temporary-order documents (ADR 0028 stage I).
 *
 * The "new order" template lives in the per-till temporary DB as an ENGINE-SHAPED document
 * (`{ uuid, payload }` — same face as an engine order resident). Everything that must
 * MUTATE it — `use-new-order`'s store/customer seeding, the local-mutation temp path, the
 * birth path's remove-and-swap — resolves the raw document here by uuid, so no context
 * value ever needs to expose a mutable face. Display consumers read the wrapped/record
 * faces the current-order context publishes; nothing outside this module touches the raw
 * document.
 *
 * The temp DB, the `.isNew` marker, and the birth heuristic are unchanged — their deletion
 * is ADR 0030, post-GA.
 */
// Lazy on purpose: several mutation modules import this one, and creating the DB at
// module load would boot it in any test (or app path) that merely imports a mutation hook.
export const temporaryDB$ = defer(() => createTemporaryDB()).pipe(shareReplay(1));

// Single-flight guard for the ensure-exists insert: the app has one subscriber (the
// module-scope resource in use-new-order), but nothing should rely on that — a second
// subscriber during the empty window would otherwise insert a second template row.
let templateInsertInFlight: Promise<unknown> | null = null;

/** The always-existing template document: inserted (engine-shaped) if the DB is empty. */
export const newOrder$: Observable<TemporaryOrderDocument> = temporaryDB$.pipe(
	switchMap((db) => {
		if (!db) throw new Error('Temporary DB not initialized');
		return db.orders.findOne().$.pipe(
			tap((order) => {
				if (isRxDocument(order) || templateInsertInFlight) return;
				templateInsertInFlight = db.orders
					.insert({
						payload: {
							status: 'pos-open',
							created_via: 'woocommerce-pos',
							billing: {},
							shipping: {},
						},
					} as never)
					.catch((error) => {
						// A swallowed rejection here means no template ever emits and the
						// POS cart suspends forever — surface it.
						temporaryOrderLogger.error(getErrorMessage(error), {
							code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
						});
					})
					.finally(() => {
						templateInsertInFlight = null;
					});
			}),
			filter((order): order is TemporaryOrderDocument => isRxDocument(order))
		);
	}),
	distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid),
	shareReplay({ bufferSize: 1, refCount: true })
);

/** Resolve the raw temporary order by uuid; null when it is not the template's uuid. */
export async function getTemporaryOrder(uuid: string): Promise<TemporaryOrderDocument | null> {
	const db = await firstValueFrom(temporaryDB$);
	if (!db) return null;
	const document = await db.orders.findOne(uuid).exec();
	return document ?? null;
}

/**
 * Merge changes into the template's payload. Top-level payload keys only — the callers
 * (store/customer seeding, cart-line writes) already build whole-field values, and RxDB's
 * incrementalModify gives the merge atomicity.
 */
export async function patchTemporaryOrderPayload(
	uuid: string,
	changes: Record<string, unknown>
): Promise<TemporaryOrderDocument | null> {
	const document = await getTemporaryOrder(uuid);
	if (!document) return null;
	return (await document.incrementalModify((data) => ({
		...data,
		payload: { ...(data.payload as Record<string, unknown>), ...changes },
	}))) as TemporaryOrderDocument;
}

/** Remove the template (the birth path's remove-and-swap). */
export async function removeTemporaryOrder(uuid: string): Promise<void> {
	const document = await getTemporaryOrder(uuid);
	if (document) await document.remove();
}
