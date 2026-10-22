import { fromMinor, isFailedPaymentStatus, readLedger, toMinor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import { readOrderCommands, type StoreLocalDatabase } from '@wcpos/query/store-local';

import { parsePosData } from '../../hooks/utils';

type Payload = EngineRecord<'orders'>['payload'];

/**
 * The one rounding cleanup (#66, #84), run after every settle: the press, a void and Try again.
 * A fee whose `payment_ref` names a leg with no live row comes back off, so the next tender (a
 * card) does not pay it: a voided or failed row (neither counts toward paid), or a row the ledger
 * never got that the journal no longer holds. A journaled record keeps its fee, because the
 * journal re-sends it at the rounded amount. A null ref belongs to a zero-balance sale and stays.
 * A synced fee leaves as a tombstone, and the stored total moves by the fee money alone (ADR 0032).
 */
export async function sweepDeadRounding(
	storeDB: StoreLocalDatabase,
	order: { uuid: string; payload: Payload; getLatest?: () => { payload: Payload } },
	dp: number,
	write: (changes: { fee_lines: object[]; total: string }) => Promise<unknown>
): Promise<void> {
	const { entries } = await readOrderCommands(storeDB, order.uuid);
	const kept = new Set(entries.map(({ id }) => id));
	const latest = order.getLatest?.().payload ?? order.payload;
	for (const { id, status } of readLedger(latest.meta_data ?? []))
		if (!isFailedPaymentStatus(status)) kept.add(id);
	let dropped = false;
	let droppedMinor = 0;
	const fee_lines = (latest.fee_lines ?? []).flatMap((fee) => {
		const ref = (parsePosData(fee)?.rounding as { payment_ref?: unknown } | undefined)?.payment_ref;
		if (fee.name == null || typeof ref !== 'string' || ref === '' || kept.has(ref)) return [fee];
		dropped = true;
		droppedMinor += toMinor(fee.total, dp) + toMinor(fee.total_tax, dp);
		return fee.id ? [{ ...fee, name: null }] : [];
	});
	if (dropped)
		await write({ fee_lines, total: fromMinor(toMinor(latest.total, dp) - droppedMinor, dp) });
}
