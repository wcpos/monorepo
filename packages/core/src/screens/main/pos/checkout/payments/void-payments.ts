import { readLedger, upsertPaymentRow, withLedger } from '@wcpos/order-math';
import type { MetaDataEntry, OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';

/**
 * Void the live payment legs when a cashier abandons a half-paid order. Offline
 * voids ride the order write already queued by the engine; online voids stay
 * sequential because each response recomputes the server's order status.
 */

export interface VoidPaymentsOrder {
	uuid: string;
	id: number | null;
	meta_data: MetaDataEntry[];
}
export interface VoidPaymentsDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	isOnline: () => boolean;
	/** Offline void rides the order write the engine already queues. */
	patchAndEnqueue: (changes: { meta_data: MetaDataEntry[] }) => Promise<void>;
	/** Online void mirrors the server's copy onto the resident; no second write. */
	mirror: (changes: { meta_data: MetaDataEntry[]; status?: string }) => Promise<void>;
	now?: () => string;
}
export interface VoidPaymentsFailure {
	paymentId: string;
	message: string;
}
export type VoidPaymentsOutcome = {
	kind: 'voided';
	via: 'online' | 'offline';
	/** The rows that ended up voided, in ledger order. */
	rows: PaymentRow[];
	/** Rows the server refused to void; still live, still owed back to the customer. */
	failed: VoidPaymentsFailure[];
	order: OrderPaymentSummary | null;
};
type ErrorResponse = { data?: { message?: string } };
function errorResponse(error: unknown): ErrorResponse | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object' ? (response as ErrorResponse) : undefined;
}
export async function voidPayments(
	order: VoidPaymentsOrder,
	deps: VoidPaymentsDeps
): Promise<VoidPaymentsOutcome> {
	const ledger = readLedger(order.meta_data);
	const liveRows = ledger.filter(({ status }) =>
		['pending', 'authorized', 'captured'].includes(status)
	);
	if (liveRows.length === 0) {
		return { kind: 'voided', via: 'offline', rows: [], failed: [], order: null };
	}

	const now = deps.now ?? (() => new Date().toISOString());
	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
	if (!online) {
		const rows = liveRows.map((row) => ({
			...row,
			status: 'voided' as const,
			updated_at_gmt: now(),
		}));
		const merged = rows.reduce(upsertPaymentRow, ledger);
		await deps.patchAndEnqueue({ meta_data: withLedger(order.meta_data, merged) });
		return { kind: 'voided', via: 'offline', rows, failed: [], order: null };
	}
	let merged = ledger;
	let lastOrder: OrderPaymentSummary | null = null;
	const rows: PaymentRow[] = [];
	const failed: VoidPaymentsFailure[] = [];
	for (const row of liveRows) {
		const localVoid = { ...row, status: 'voided' as const, updated_at_gmt: now() };
		try {
			const response = await deps.post(`orders/${order.id}/payments/${row.id}/void`, {});
			const accepted = (response.data ?? {}) as {
				payment?: PaymentRow;
				order?: OrderPaymentSummary;
			};
			const serverRow = accepted.payment ?? localVoid;
			merged = upsertPaymentRow(merged, serverRow);
			rows.push(serverRow);
			// Keep the most recent summary the server DID send: a later response that
			// omits one must not throw away the order status an earlier one gave us.
			if (accepted.order) lastOrder = accepted.order;
		} catch (error) {
			failed.push({
				paymentId: row.id,
				message:
					errorResponse(error)?.data?.message ||
					(error instanceof Error && error.message ? error.message : row.id),
			});
		}
	}
	if (rows.length === 0) {
		return { kind: 'voided', via: 'online', rows, failed, order: null };
	}
	await deps.mirror({
		meta_data: withLedger(order.meta_data, merged),
		...(lastOrder ? { status: lastOrder.status } : {}),
	});
	return { kind: 'voided', via: 'online', rows, failed, order: lastOrder };
}
