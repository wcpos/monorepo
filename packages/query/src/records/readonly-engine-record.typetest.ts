import type { ReadonlyEngineRecord } from './readonly-engine-record';

declare const record: ReadonlyEngineRecord<'orders'>;
// @ts-expect-error Named reads expose no record writes.
record.patch({});
// @ts-expect-error No raw collection back-reference.
void record.collection;
// @ts-expect-error Refreshing cannot recover a mutator.
record.getLatest().incrementalPatch({});
record.$.subscribe((latest) => {
	// @ts-expect-error Reactive snapshots are read-only too.
	latest.patch({});
});
// @ts-expect-error Attachments cannot recover mutable documents.
record.getAttachment('receipt');
