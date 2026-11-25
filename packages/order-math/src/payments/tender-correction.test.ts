import {
	allowedOrderStatuses,
	availableForRefund,
	derive,
	effectiveRows,
	hasRefundableMoney,
	netRefundable,
} from './derive';
import { partitionVoidableRows, withLedger } from './ledger';
import {
	correctionOf,
	isPlainManualMethod,
	isTenderCorrectable,
	tenderCorrectionTargets,
} from './tender-correction';

import type { MetaDataEntry } from './ledger';
import type { PaymentMethodDescriptor, PaymentRow } from './types';

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
	// prettier-ignore
	return {
		id: 'orig', source: 'app', order_id: 12, method_id: 'pos_card', provider: null,
		kind: 'card', capture_mode: 'manual', transport: null, recorded_offline: false,
		amount: '10.00', currency: 'USD', tendered: '10.00', change: '0.00', tip: null,
		status: 'captured', failure_reason: null, refunded_amount: '0.00', refunds: [],
		provider_refs: {}, receipt: {}, cashier_id: 1, store_id: null,
		created_at_gmt: '2026-11-01T00:00:00Z', captured_at_gmt: '2026-11-01T00:00:00Z',
		updated_at_gmt: '2026-11-01T00:00:00Z', ...overrides,
	};
}

const original = row();
const minus = row({
	id: 'rminus',
	amount: '-10.00',
	tendered: '-10.00',
	entry: 'tender_correction',
	reverses: 'orig',
	captured_at_gmt: '2026-11-02T00:00:00Z',
});
const plus = row({
	id: 'rplus',
	method_id: 'pos_cash',
	kind: 'cash',
	entry: 'tender_correction',
	corrects: 'orig',
	captured_at_gmt: '2026-11-02T00:00:00Z',
});
const corrected = [original, minus, plus];

/** A completed sale: its completion counted every listed row. */
function completedMeta(rows: PaymentRow[], counted = rows.map(({ id }) => id)): MetaDataEntry[] {
	return [
		...withLedger([], rows),
		{ key: '_wcpos_completions', value: [{ payment_ids: counted }] },
	];
}

function method(
	id: string,
	overrides: Partial<PaymentMethodDescriptor> = {}
): PaymentMethodDescriptor {
	// prettier-ignore
	return {
		schema: 1, id, title: id, kind: 'cash', pos_enabled: true, order: 0,
		capture: { mode: 'manual', provider: null, hardware: null, webview_available: false,
			modes: [{ mode: 'manual', provider: null, hardware: null }] },
		capabilities: { amount: { partial: true }, change: true, refunds: { via: 'manual', partial: true },
			tips: 'none', offline: 'record', void: true },
		defaults: { order_status: 'completed', rounding: null, open_drawer: false },
		provider_data: {}, ...overrides,
	} as PaymentMethodDescriptor;
}

describe('isTenderCorrectable (test 1)', () => {
	it('accepts a plain captured manual app row on a completed order, and an R+', () => {
		expect(isTenderCorrectable(original, [original], completedMeta([original]))).toBe(true);
		expect(isTenderCorrectable(plus, corrected, completedMeta([original]))).toBe(true);
	});

	it.each<[string, PaymentRow, PaymentRow[], MetaDataEntry[] | undefined]>([
		['not_captured', row({ status: 'authorized' }), [], undefined],
		['voidable (no completion counted it)', original, [original], withLedger([], [original])],
		['is_reversal', minus, corrected, undefined],
		['already_corrected', original, corrected, undefined],
		['refunded', row({ refunds: [{ status: 'failed', amount: '1.00' } as never] }), [], undefined],
		['provider_row: capture_mode', row({ capture_mode: 'device' }), [], undefined],
		['provider_row: source', row({ source: 'webview' }), [], undefined],
		['provider_row: provider', row({ provider: 'stripe' }), [], undefined],
	])('refuses %s', (_reason, candidate, rows, meta) => {
		const ledger = rows.length ? rows : [candidate];
		expect(isTenderCorrectable(candidate, ledger, meta ?? completedMeta(ledger))).toBe(false);
	});
});

describe('correctionOf and effectiveRows (test 2)', () => {
	it('reads card corrected to cash', () => {
		expect(correctionOf(original, corrected)).toBe(plus);
		expect(correctionOf(plus, corrected)).toBeNull();
		expect(correctionOf(original, [original, plus])).toBeNull(); // no R- partner yet
		expect(effectiveRows(corrected)).toEqual([plus]);
	});

	it('drops only the pair’s reversed halves; status is each reader’s own predicate', () => {
		const pending = row({ id: 'pending', status: 'pending' });
		const voided = row({ id: 'voided', status: 'voided' });
		expect(effectiveRows([pending, ...corrected, voided])).toEqual([pending, plus, voided]);
		// A failed R- reversed nothing, but it is still an R-.
		const failedMinus = { ...minus, status: 'failed' as const };
		expect(effectiveRows([original, failedMinus])).toEqual([original]);
	});

	it('reads a re-correction through the R+', () => {
		const minus2 = row({
			id: 'rminus2',
			amount: '-10.00',
			entry: 'tender_correction',
			reverses: 'rplus',
		});
		const plus2 = row({
			id: 'rplus2',
			method_id: 'pos_cheque',
			entry: 'tender_correction',
			corrects: 'rplus',
		});
		const rows = [...corrected, minus2, plus2];
		expect(correctionOf(original, rows)).toBe(plus);
		expect(correctionOf(plus, rows)).toBe(plus2);
		expect(effectiveRows(rows)).toEqual([plus2]);
		expect(isTenderCorrectable(plus2, rows, completedMeta([original]))).toBe(true);
		expect(isTenderCorrectable(plus, rows, completedMeta([original]))).toBe(false);
	});
});

describe('refund bounds after a correction (test 3)', () => {
	it('zeroes R- and the reversed original, keeps R+', () => {
		expect(availableForRefund(original, corrected)).toBe(0);
		expect(availableForRefund(minus, corrected)).toBe(0);
		expect(availableForRefund(plus, corrected)).toBe(10);
		// A refund destination list offers only the R+ row.
		expect(corrected.filter((r) => availableForRefund(r, corrected) > 0)).toEqual([plus]);
	});

	it('bounds netRefundable at exactly the corrected money', () => {
		expect(netRefundable('10.00', [], corrected)).toBe(10);
		// A total the ledger does not fully cover: the reversed original must not add 10.
		expect(netRefundable('20.00', [], corrected)).toBe(10);
		expect(hasRefundableMoney(corrected)).toBe(true);
		expect(hasRefundableMoney([original, minus])).toBe(false);
	});
});

it('derive() reads the three-row ledger as the uncorrected sale (test 4)', () => {
	const methods = [method('pos_card', { title: 'Card' }), method('pos_cash', { title: 'Cash' })];
	const view = derive('10.00', corrected, methods);
	expect(view).toMatchObject({ paid: '10.00', balance: '0.00', change: '0.00', overpaid: '0.00' });
	expect(view.payment_method).toBe('pos_cash');
	expect(view.payment_method_title).toBe('Cash');
	const base = ['completed', 'processing', 'cancelled', 'refunded'];
	const before = allowedOrderStatuses(base, 'completed', { total: '10.00', rows: [original] });
	expect(allowedOrderStatuses(base, 'completed', { total: '10.00', rows: corrected })).toEqual(
		before
	);
});

it('B1: derive() drops the change of a cash leg corrected to card', () => {
	const cash = row({
		kind: 'cash',
		method_id: 'pos_cash',
		amount: '15.00',
		tendered: '20.00',
		change: '5.00',
	});
	expect(derive('15.00', [cash], []).change).toBe('5.00');
	const reversal = row({
		...cash,
		id: 'rminus',
		amount: '-15.00',
		tendered: '-15.00',
		change: '0.00',
		entry: 'tender_correction',
		reverses: 'orig',
	});
	const card = row({
		id: 'rplus',
		amount: '15.00',
		tendered: '15.00',
		entry: 'tender_correction',
		corrects: 'orig',
	});
	expect(derive('15.00', [cash, reversal, card], [])).toMatchObject({
		paid: '15.00',
		change: '0.00',
	});
});

it('partitionVoidableRows retains R+, R- and the reversed row (test 5)', () => {
	// None counted: today each would be voidable as an uncounted captured manual row.
	const { voidable, retained } = partitionVoidableRows(withLedger([], corrected));
	expect(voidable).toEqual([]);
	expect(retained.map(({ id }) => id)).toEqual(['orig', 'rminus', 'rplus']);
	expect(partitionVoidableRows(withLedger([], [original])).voidable).toEqual([original]);
});

describe('tenderCorrectionTargets', () => {
	const cash05 = method('pos_cash', {
		defaults: {
			order_status: 'completed',
			rounding: { increment: '0.05', mode: 'nearest' },
			open_drawer: false,
		},
	});
	const stripe = method('stripe', {
		capture: {
			mode: 'device',
			provider: 'stripe',
			hardware: null,
			webview_available: false,
			modes: [{ mode: 'device', provider: 'stripe', hardware: null }],
		},
	});
	it('offers enabled methods other than the row’s own and stored value, never re-rounding', () => {
		const methods = [
			method('pos_card'),
			cash05,
			method('pos_cheque'),
			method('pos_off', { pos_enabled: false }),
			stripe,
			method('gift_card', { kind: 'stored_value' }),
			method('stripe05', {
				capture: stripe.capture,
				defaults: cash05.defaults,
			}),
		];
		expect(tenderCorrectionTargets(original, methods, 2).map(({ id }) => id)).toEqual([
			'pos_cash',
			'pos_cheque',
			'stripe',
			'stripe05',
		]);
		const odd = row({ amount: '10.03' });
		expect(tenderCorrectionTargets(odd, methods, 2).map(({ id }) => id)).toEqual([
			'pos_cheque',
			'stripe',
		]);
	});
});

describe('isPlainManualMethod (#3651)', () => {
	it('is true only for a method with no provider and a manual mode', () => {
		expect(isPlainManualMethod(method('pos_cheque'))).toBe(true);
		const providerManual = method('stripe_manual', {
			capture: {
				mode: 'manual',
				provider: 'stripe',
				hardware: null,
				webview_available: false,
				modes: [{ mode: 'manual', provider: null, hardware: null }],
			},
		});
		expect(isPlainManualMethod(providerManual)).toBe(false);
		const noModes = method('pos_other', {
			capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
		});
		expect(isPlainManualMethod(noModes)).toBe(false);
	});
});
