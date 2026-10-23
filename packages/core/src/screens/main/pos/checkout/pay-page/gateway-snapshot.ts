import { isSaleComplete, type SaleOutcome } from '../sale-completion';

type GatewaySnapshotOutcome = Extract<SaleOutcome, { source: 'gateway-snapshot' }>;

export interface JudgedGatewaySnapshot {
	outcome: GatewaySnapshotOutcome;
	/** The status stored for the snapshot's OWN gateway; null when it has none or the catalog has not loaded. */
	storedStatus: string | null;
	/** Whether the sale is finished: `isSaleComplete`, never reimplemented here. */
	complete: boolean;
}

/**
 * Judge an order the pay page, or the store, handed back. The whole catalog is passed because
 * the pay page lists every POS gateway; a stored status is only honoured for the gateway it was
 * stored for, so one gateway's status never closes a sale taken through another.
 */
export function judgeGatewaySnapshot(
	snapshot: Record<string, unknown>,
	storedStatuses: Record<string, string | null>,
	dp: number
): JudgedGatewaySnapshot {
	const method = snapshot.payment_method;
	const storedStatus = typeof method === 'string' ? (storedStatuses[method] ?? null) : null;
	const outcome: GatewaySnapshotOutcome = {
		source: 'gateway-snapshot',
		snapshot: snapshot as GatewaySnapshotOutcome['snapshot'],
		settledOrderStatus: storedStatus,
	};
	return { outcome, storedStatus, complete: isSaleComplete(outcome, dp) };
}
