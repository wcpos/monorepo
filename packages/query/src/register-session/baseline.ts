import type { RegisterSessionRow } from '@wcpos/database';
import { readLedger } from '@wcpos/order-math';

import type { ReadonlyEngineRecord } from '../records/readonly-engine-record';

export function afterBaseline(at?: string | null, baselineAt?: string | null) {
	baselineAt = baselineAt?.replace(/Z?$/, 'Z');
	return (
		!!at && !!baselineAt && Date.parse(at.endsWith('Z') ? at : `${at}Z`) > Date.parse(baselineAt)
	);
}
export function outsideBaseline(
	record: {
		remoteId?: unknown;
		payload: { id?: number; date_created_gmt?: string };
	},
	baselineAt?: string | null,
	orderIds?: readonly number[] | null
) {
	if (orderIds != null) return !orderIds.some((id) => id === record.payload.id);
	return record.remoteId === null || afterBaseline(record.payload.date_created_gmt, baselineAt);
}
/** What the server snapshot already counts; undefined when the session has no snapshot. */
export function baselineContains(
	orders: readonly { payload: { meta_data?: Parameters<typeof readLedger>[0] } }[],
	refunds: readonly ReadonlyEngineRecord<'refunds'>[],
	movements: readonly { id: string }[],
	snapshot?: Partial<
		Pick<
			RegisterSessionRow,
			'server_expected_at' | 'server_movement_ids' | 'server_ledger_row_ids' | 'server_refund_ids'
		>
	> | null
) {
	const baselineAt = snapshot?.server_expected_at;
	const movementIds = snapshot?.server_movement_ids ?? [];
	const ledgerRowIds = snapshot?.server_ledger_row_ids;
	const refundIds = snapshot?.server_refund_ids;
	if (!baselineAt) return undefined;
	const pending = new Set<string | number | null | undefined>([
		...refunds
			.filter((row) => outsideBaseline(row, baselineAt, refundIds))
			.map((row) => row.payload.id),
		...movements.filter((row) => !movementIds.includes(row.id)).map((row) => row.id),
		...orders.flatMap((order) =>
			readLedger(order.payload.meta_data).flatMap((row) =>
				(row.refunds ?? [])
					.filter((refund) => {
						const at = (refund as { created_at_gmt?: string }).created_at_gmt;
						return refundIds != null
							? !refundIds.includes(refund.id)
							: !at || afterBaseline(at, baselineAt);
					})
					.map(({ id }) => id)
			)
		),
		...orders.flatMap((order) =>
			readLedger(order.payload.meta_data)
				.filter((row) =>
					ledgerRowIds != null
						? !ledgerRowIds.includes(row.id)
						: afterBaseline(row.created_at_gmt, baselineAt)
				)
				.map(({ id }) => id)
		),
	]);
	return (id: string | number | null | undefined) => !pending.has(id);
}
