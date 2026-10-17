import * as React from 'react';

import { COLLECTION_VOCABULARY, engineCollection, useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { rowKeyForTelemetryCollection } from './database-logic';
import { recordHandle } from './record-handle';

const healthLogger = getLogger(['wcpos', 'health']);

type Translate = ReturnType<typeof useT>;

/** One record is "Order", not "Orders" — literal keys so the string extractor sees them. */
function recordKind(collection: string, t: Translate): string {
	switch (collection) {
		case 'orders':
			return t('common.order');
		case 'products':
			return t('common.product');
		case 'variations':
			return t('common.variation');
		case 'customers':
			return t('common.customer');
	}
	const labelKey = (COLLECTION_VOCABULARY as Record<string, { labelKey?: string } | undefined>)[
		collection
	]?.labelKey;
	return labelKey ? t(labelKey) : collection;
}

export type RecordLabel = {
	/** Translated record kind ("Order"). */
	kind: string;
	/** The record's own handle ("#1234 · 45.00"), once read. */
	handle: string | null;
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
 * Effect (last resort per project.mdc): a one-shot async primary-key read
 * through the typed collection boundary — the label is decoration on top of
 * the log-derived row, so it neither suspends nor subscribes per row.
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
		found: boolean;
	} | null>(null);

	React.useEffect(() => {
		if (!collection || !recordId || key === null) return;
		const rowKey = rowKeyForTelemetryCollection(collection);
		if (rowKey === null) return;
		const records = engineCollection(engine.active()?.database, rowKey);
		if (!records) return;
		let cancelled = false;
		void (async () => {
			try {
				const doc = await records.findOne(recordId).exec();
				if (cancelled) return;
				const json = doc
					? ((typeof (doc as { toJSON?: unknown }).toJSON === 'function'
							? (doc as { toJSON(): unknown }).toJSON()
							: doc) as Record<string, unknown>)
					: null;
				setResolved({ key, handle: json ? recordHandle(json) : null, found: json !== null });
			} catch (error) {
				if (cancelled) return;
				// Not `collection`/`recordId`: a context carrying those keys is
				// itself labelled by this hook on the Logs screen, and a read that
				// keeps failing must not feed itself new rows to fail on.
				healthLogger.warn('Could not read a record to name it', {
					context: { target: `${collection}/${recordId}`, error: getErrorMessage(error) },
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [collection, engine, key, recordId]);

	if (!collection || key === null) return null;
	const kind = recordKind(collection, t);
	const current = resolved !== null && resolved.key === key ? resolved : null;
	if (current === null) return { kind, handle: null, status: 'unresolved', text: kind };
	if (!current.found) {
		return {
			kind,
			handle: null,
			status: 'missing',
			text: t('health.logs.record_not_on_device', { kind }),
		};
	}
	return {
		kind,
		handle: current.handle,
		status: 'found',
		text: current.handle ? t('health.logs.record_label', { kind, label: current.handle }) : kind,
	};
}
