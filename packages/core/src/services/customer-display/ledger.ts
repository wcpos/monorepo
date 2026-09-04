import { fromMinor, type PaymentRow, type PaymentStatus, toMinor } from '@wcpos/order-math';
import { formatMoney } from '@wcpos/printer/encoder/format-money';

export interface LedgerPayment {
	id: string;
	method: string;
	kind: string;
	amount: string;
	amount_raw: number;
	tendered?: string;
	tendered_raw?: number;
	change?: string;
	change_raw?: number;
	status: PaymentStatus;
}
export interface DisplayLedger {
	status: 'unpaid' | 'partial' | 'paid';
	total: string;
	total_raw: number;
	paid: string;
	paid_raw: number;
	due: string;
	due_raw: number;
	change: string;
	change_raw: number;
	payments: LedgerPayment[];
}
export interface PaymentEvent {
	state: 'started' | 'approved' | 'declined' | 'complete';
	leg?: LedgerPayment;
	message?: string;
}
export function buildLedger(
	rows: readonly PaymentRow[],
	total: number,
	currency: string,
	locale: string | undefined,
	methodTitles: ReadonlyMap<string, string>,
	dp: number
): DisplayLedger {
	const approved = rows.filter(({ status }) => status === 'captured' || status === 'authorized');
	const paidMinor = approved.reduce((sum, payment) => sum + toMinor(payment.amount, dp), 0);
	const changeMinor = approved.reduce((sum, payment) => sum + toMinor(payment.change, dp), 0);
	const dueMinor = Math.max(toMinor(total, dp) - paidMinor, 0);
	const paid = Number(fromMinor(paidMinor, dp));
	const change = Number(fromMinor(changeMinor, dp));
	const due = Number(fromMinor(dueMinor, dp));
	const money = (amount: number) => formatMoney(amount, currency, locale, dp);
	const payments = rows.map((payment): LedgerPayment => {
		const amount = Number(payment.amount);
		const tendered = payment.tendered === null ? undefined : Number(payment.tendered);
		const paymentChange = payment.change === null ? undefined : Number(payment.change);
		return {
			id: payment.id,
			method: methodTitles.get(payment.method_id) ?? payment.method_id,
			kind: payment.kind,
			amount: money(amount),
			amount_raw: amount,
			...(tendered === undefined ? {} : { tendered: money(tendered), tendered_raw: tendered }),
			...(paymentChange === undefined
				? {}
				: { change: money(paymentChange), change_raw: paymentChange }),
			status: payment.status,
		};
	});
	return {
		status:
			dueMinor === 0 && approved.length > 0 ? 'paid' : approved.length > 0 ? 'partial' : 'unpaid',
		total: money(total),
		total_raw: total,
		paid: money(paid),
		paid_raw: paid,
		due: money(due),
		due_raw: due,
		change: money(change),
		change_raw: change,
		payments,
	};
}
export function derivePaymentEvent(
	prevRows: readonly PaymentRow[],
	nextRows: readonly PaymentRow[],
	prevOrderStatus: string,
	orderStatus: string,
	ledger: DisplayLedger,
	declinedMessage?: string
): PaymentEvent | null {
	if (prevOrderStatus !== 'completed' && orderStatus === 'completed') {
		const leg = ledger.payments.findLast(
			({ status }) => status === 'captured' || status === 'authorized'
		);
		return { state: 'complete', ...(leg ? { leg } : {}) };
	}
	const previous = new Map(prevRows.map((row) => [row.id, row]));
	const changed = nextRows.filter((row) => previous.get(row.id)?.status !== row.status);
	if (changed.length === 0) return null;
	const row = changed.at(-1)!;
	const leg = ledger.payments.find(({ id }) => id === row.id)!;
	if (ledger.due_raw === 0 && (row.status === 'captured' || row.status === 'authorized')) {
		return { state: 'complete', leg };
	}
	if (row.status === 'failed' || row.status === 'voided') {
		return {
			state: 'declined',
			leg,
			...(declinedMessage === undefined ? {} : { message: declinedMessage }),
		};
	}
	if (row.status === 'authorized' || row.status === 'captured') {
		return { state: 'approved', leg };
	}
	if (!previous.has(row.id) && row.status === 'pending') return { state: 'started', leg };
	return null;
}
