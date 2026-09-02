import { v4 as uuidv4 } from 'uuid';

import { mintManualPayment, readLedger, upsertPaymentRow, withLedger } from '@wcpos/order-math';
import type {
	MetaDataEntry,
	OrderPaymentSummary,
	PaymentMethodDescriptor,
	PaymentRow,
} from '@wcpos/order-math';

/**
 * Record a `manual` payment (cash, dummy card) against an order — Payments Contract v1
 * §5 / §7 (wcpos/roadmap#142). The ledger lives in the order's `_wcpos_payments`
 * typed meta; an offline row rides the order write the sync engine already queues,
 * an online row goes through `POST orders/{id}/payments` and the server's copy is
 * mirrored back. Pure apart from the injected deps so the decision tree is testable.
 */

export interface RecordManualPaymentOrder {
	uuid: string;
	id: number | null;
	number?: string;
	meta_data: MetaDataEntry[];
}
export interface RecordManualPaymentInput {
	amount: string | number;
	tendered?: string | number | null;
}
export interface RecordManualPaymentDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	isOnline: () => boolean;
	cashierId: number;
	storeId: number | null;
	currency: string;
	dp: number;
	patchAndEnqueue: (changes: { meta_data: MetaDataEntry[] }) => Promise<void>;
	mirror: (changes: { meta_data: MetaDataEntry[]; status?: string }) => Promise<void>;
	raiseAttention: (entry: {
		row: PaymentRow;
		order: OrderPaymentSummary | null;
		reason: RefusalReason;
	}) => void;
	now?: () => string;
	uuid?: () => string;
}
type InvalidReason =
	'not_manual' | 'amount_not_positive' | 'tendered_not_allowed' | 'tendered_below_amount';
type RefusalReason = 'order_already_paid' | 'amount_exceeds_balance';
export type RecordManualPaymentOutcome =
	| {
			kind: 'recorded';
			via: 'online' | 'offline';
			row: PaymentRow;
			order: OrderPaymentSummary | null;
	  }
	| { kind: 'refused'; reason: RefusalReason; row: PaymentRow; order: OrderPaymentSummary | null }
	| { kind: 'invalid'; reason: InvalidReason };

export class RecordManualPaymentError extends Error {
	public constructor(
		message: string,
		public code: string,
		public status: number | undefined
	) {
		super(message);
		this.name = 'RecordManualPaymentError';
	}
}

type ErrorResponse = {
	status?: number;
	data?: {
		code?: string;
		message?: string;
		data?: { payment?: PaymentRow; order?: OrderPaymentSummary };
	};
};

function errorResponse(error: unknown): ErrorResponse | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object' ? (response as ErrorResponse) : undefined;
}

function refusalReason(code: string | undefined): RefusalReason | null {
	if (code === 'wcpos_order_already_paid') return 'order_already_paid';
	if (code === 'wcpos_amount_exceeds_balance') return 'amount_exceeds_balance';
	return null;
}

export async function recordManualPayment(
	order: RecordManualPaymentOrder,
	method: PaymentMethodDescriptor,
	input: RecordManualPaymentInput,
	deps: RecordManualPaymentDeps
): Promise<RecordManualPaymentOutcome> {
	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
	const minted = mintManualPayment({
		method,
		amount: input.amount,
		tendered: input.tendered,
		currency: deps.currency,
		orderId: order.id,
		cashierId: deps.cashierId,
		storeId: deps.storeId,
		recordedOffline: !online,
		now: deps.now ?? (() => new Date().toISOString()),
		uuid: deps.uuid ?? uuidv4,
		dp: deps.dp,
	});
	if (!minted.ok) return { kind: 'invalid', reason: minted.reason };
	const metaDataWith = (row: PaymentRow) =>
		withLedger(order.meta_data, upsertPaymentRow(readLedger(order.meta_data), row));

	const writeOffline = async (row: PaymentRow): Promise<RecordManualPaymentOutcome> => {
		const offlineRow = row.recorded_offline ? row : { ...row, recorded_offline: true };
		await deps.patchAndEnqueue({ meta_data: metaDataWith(offlineRow) });
		return { kind: 'recorded', via: 'offline', row: offlineRow, order: null };
	};

	if (!online) return writeOffline(minted.row);

	// Only the request is inside the try: once the server has answered 2xx the row is
	// recorded, and a failure while mirroring it locally must surface as that failure —
	// never as the offline fallback, which would enqueue the row a second time.
	let accepted: { payment?: PaymentRow; order?: OrderPaymentSummary };
	try {
		const response = await deps.post(`orders/${order.id}/payments`, { payment: minted.row });
		accepted = (response.data ?? {}) as { payment?: PaymentRow; order?: OrderPaymentSummary };
	} catch (error) {
		const response = errorResponse(error);
		const reason = refusalReason(response?.data?.code);
		if (reason) {
			// The server STORED the refused row as `failed`; mirror its copy so the ledger
			// shows the money that was taken, then put the order in front of the cashier.
			const failedRow = response?.data?.data?.payment ?? {
				...minted.row,
				status: 'failed',
				failure_reason: reason,
			};
			const serverOrder = response?.data?.data?.order ?? null;
			await deps.mirror({
				meta_data: metaDataWith(failedRow),
				...(serverOrder ? { status: serverOrder.status } : {}),
			});
			deps.raiseAttention({ row: failedRow, order: serverOrder, reason });
			return { kind: 'refused', reason, row: failedRow, order: serverOrder };
		}
		const status = response?.status;
		const code = response?.data?.code;
		if (code && status !== undefined && status >= 400 && status < 500) {
			// A definitive refusal the server will repeat (conflict, unknown method, bad
			// param): nothing is written — the caller decides.
			throw new RecordManualPaymentError(response?.data?.message ?? code, code, status);
		}
		if (!response || (status !== undefined && status >= 500)) {
			// The server may or may not have stored the row. The SAME id rides the order
			// write, so a replay of a known id returns the stored row instead of a duplicate.
			return writeOffline(minted.row);
		}
		throw error;
	}

	const serverRow = accepted.payment ?? minted.row;
	const serverOrder = accepted.order ?? null;
	await deps.mirror({
		meta_data: metaDataWith(serverRow),
		...(serverOrder ? { status: serverOrder.status } : {}),
	});
	return { kind: 'recorded', via: 'online', row: serverRow, order: serverOrder };
}
