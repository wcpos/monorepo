import * as React from 'react';

import { EMPTY, merge, Observable } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import {
	COLLECTION_VOCABULARY,
	engineCollection,
	observeEngineCollection,
	resolveLegacyField,
	useQueryRuntime,
} from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { rowKeyForTelemetryCollection } from './database-logic';
import { recordHandle } from './record-handle';

const healthLogger = getLogger(['wcpos', 'health']);

type Translate = ReturnType<typeof useT>;

/**
 * One record is "Order", not "Orders". Literal keys throughout so the string
 * extractor sees every one; kinds with no singular in the catalogue keep
 * their collection name.
 */
function recordKind(collection: string, t: Translate): string {
	switch (rowKeyForTelemetryCollection(collection)) {
		case 'orders':
			return t('common.order');
		case 'products':
			return t('common.product');
		case 'variations':
			return t('common.variation');
		case 'customers':
			return t('common.customer');
		case 'categories':
			return t('common.category');
		case 'brands':
			return t('common.brand');
		case 'tags':
			return t('common.tag');
		case 'taxRates':
			return t('common.tax_rates');
		case 'coupons':
			return t('common.coupon');
		default:
			return collection;
	}
}

export type RecordLabel = {
	/** Translated record kind ("Order"). */
	kind: string;
	/** The record's own handle ("#1234 · 45.00"), once read. */
	handle: string | null;
	/** The record's local uuid once found — the edit routes are keyed by it. */
	uuid: string | null;
	/**
	 * 'found' — read from this device; 'missing' — this device does not hold it;
	 * 'unresolved' — not read (yet), or a kind with no local record to read.
	 */
	status: 'found' | 'missing' | 'unresolved';
	/** The visible line: "Order: #1234 · 45.00", "Order (not on this device)", or the kind. */
	text: string;
};

/**
 * Names the record a row is about, read from this device: the shared label for
 * the Logs ledger, the expanded log row and the Database attention panel, so
 * the three can never disagree about what a record is called. The raw id is
 * never the visible line — support reads it from the row's Details.
 *
 * Effect (last resort per project.mdc): observes the one matching document
 * through the typed collection stream, so the name follows the record —
 * a re-download refilling it, an edit renaming it, a delete removing it. It
 * never suspends: the label is decoration on top of the log-derived row.
 */
export function useRecordLabel(
	collection: string | null | undefined,
	recordId: string | null | undefined
): RecordLabel | null {
	const t = useT();
	const { engine } = useQueryRuntime();
	const key = collection && recordId ? `${collection}:${recordId}` : null;
	// Keyed by identity: a stale resolution stops matching instead of needing a
	// synchronous reset in the effect.
	const [resolved, setResolved] = React.useState<{
		key: string;
		handle: string | null;
		uuid: string | null;
		found: boolean;
	} | null>(null);

	React.useEffect(() => {
		if (!collection || !recordId || key === null) return;
		const rowKey = rowKeyForTelemetryCollection(collection);
		if (rowKey === null) return;
		// Push-side rows carry the local uuid; pull-side repair rows
		// (`apply.escalation`, SYNC331) carry the store's numeric id. Every
		// collection, pull-only ones included (a tax-rate range checksum), keeps
		// that id in the column the registry maps `id` to, not the primary key.
		const remoteId = remoteIdOrNull(recordId);
		const query =
			remoteId !== null
				? {
						selector: {
							[resolveLegacyField(COLLECTION_VOCABULARY[rowKey].legacyName, 'id').enginePath]:
								remoteId,
						},
					}
				: recordId;
		// Re-read on every database the engine opens: a row mounted on cold start,
		// before the scope is open, must still get its name once it is. Each
		// emission drops the previous answer first — store ids overlap across
		// stores, so another store's record name must never stand in.
		// Clear & re-download replaces the collection IN the same database, so
		// `db$` stays quiet and the old collection's query goes dead; the engine's
		// `collection-reset` event is the signal to observe the replacement, which
		// then reports the record as the refill lands.
		const replaced$ = new Observable<void>((subscriber) =>
			engine.events((event) => {
				if (event.type === 'collection-reset' && event.collection === rowKey) subscriber.next();
			})
		).pipe(map(() => engineCollection(engine.active()?.database, rowKey)));
		const subscription = merge(observeEngineCollection(engine, rowKey), replaced$)
			.pipe(
				tap(() => setResolved(null)),
				switchMap((records) =>
					records
						? records.findOne(query).$.pipe(
								// Per query, so the next database the engine opens still gets one.
								catchError((error: unknown) => {
									// Not `collection`/`recordId`: a context carrying those keys
									// is itself labelled by this hook on the Logs screen, and a
									// read that keeps failing must not feed itself rows to fail on.
									healthLogger.warn('Could not read a record to name it', {
										context: {
											target: `${collection}/${recordId}`,
											error: getErrorMessage(error),
										},
									});
									return EMPTY;
								})
							)
						: EMPTY
				)
			)
			.subscribe((doc) => {
				const json = doc
					? ((typeof (doc as { toJSON?: unknown }).toJSON === 'function'
							? (doc as { toJSON(): unknown }).toJSON()
							: doc) as Record<string, unknown>)
					: null;
				setResolved({
					key,
					handle: json ? recordHandle(json) : null,
					uuid:
						json && typeof json.uuid === 'string' ? json.uuid : remoteId === null ? recordId : null,
					found: json !== null,
				});
			});
		return () => subscription.unsubscribe();
	}, [collection, engine, key, recordId]);

	if (!collection || key === null) return null;
	const kind = recordKind(collection, t);
	const current = resolved !== null && resolved.key === key ? resolved : null;
	if (current === null) return { kind, handle: null, uuid: null, status: 'unresolved', text: kind };
	if (!current.found) {
		return {
			kind,
			handle: null,
			uuid: null,
			status: 'missing',
			text: t('health.logs.record_not_on_device', { kind }),
		};
	}
	return {
		kind,
		handle: current.handle,
		uuid: current.uuid,
		status: 'found',
		text: current.handle ? t('health.logs.record_label', { kind, label: current.handle }) : kind,
	};
}
