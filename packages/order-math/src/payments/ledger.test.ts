/**
 * Ledger tests protect typed-meta preservation and deterministic manual payment rows.
 */

import {
	mintDevicePayment,
	mintManualPayment,
	mintServerPayment,
	readLedger,
	upsertPaymentRow,
	withLedger,
} from './ledger';

import type { MetaDataEntry, MintManualPaymentInput } from './ledger';
import type { CaptureMode, PaymentKind, PaymentMethodDescriptor, PaymentRow } from './types';

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
	// Compact fixture plumbing preserves the explicit test-line budget.
	// prettier-ignore
	return {
		id: 'abc', source: 'app', order_id: 0, method_id: 'pos_cash', provider: null,
		kind: 'cash', capture_mode: 'manual', transport: null, recorded_offline: false,
		amount: '42.50', currency: 'USD', tendered: null, change: null, tip: null,
		status: 'captured', failure_reason: null, refunded_amount: '0.00', refunds: [],
		provider_refs: {}, receipt: {}, cashier_id: 1, store_id: null,
		created_at_gmt: '2026-01-01T00:00:00Z',
		captured_at_gmt: '2026-01-01T00:00:00Z',
		updated_at_gmt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function method(kind: PaymentKind, mode: CaptureMode, change = false): PaymentMethodDescriptor {
	// Compact fixture plumbing preserves the explicit test-line budget.
	// prettier-ignore
	return {
		schema: 1, id: `pos_${kind}`, title: kind, kind, pos_enabled: true, order: 0,
		capture: { mode, provider: 'provider', hardware: null, webview_available: false },
		capabilities: { amount: { partial: true }, change, refunds: { via: 'manual', partial: true },
			tips: 'none', offline: 'record', void: true },
		defaults: { order_status: 'completed', rounding: null, open_drawer: false },
		provider_data: {},
	};
}

describe('ledger meta', () => {
	it('reads object and legacy JSON ledgers', () => {
		const payment = row();
		expect(
			readLedger([{ key: '_wcpos_payments', value: { schema: 1, payments: [payment] } }])
		).toEqual([payment]);
		expect(
			readLedger([
				{ key: '_wcpos_payments', value: JSON.stringify({ schema: 1, payments: [payment] }) },
			])
		).toEqual([payment]);
	});

	it.each([
		[[{ key: '_wcpos_payments', value: { schema: 2, payments: [] } }]],
		[[]],
		[[{ key: '_wcpos_payments', value: '{bad' }]],
		[[{ key: '_wcpos_payments', value: { schema: 1, payments: {} } }]],
		[[{ key: '_wcpos_payments', value: { schema: 1, payments: [{}] } }]],
	] as const)('returns empty for absent or invalid ledger data', (meta) => {
		expect(readLedger(meta as readonly MetaDataEntry[])).toEqual([]);
	});

	it('replaces in place, preserves the id and neighbours, and does not mutate input', () => {
		const input: MetaDataEntry[] = [
			{ key: 'before', value: 1 },
			{ id: 77, key: '_wcpos_payments', value: { schema: 1, payments: [] } },
			{ key: 'after', value: 2 },
		];
		const output = withLedger(input, [row()]);
		expect(output.map(({ key }) => key)).toEqual(['before', '_wcpos_payments', 'after']);
		expect(output[1]).toMatchObject({ id: 77, value: { schema: 1, payments: [row()] } });
		expect(typeof output[1].value).toBe('object');
		expect(input[1].value).toEqual({ schema: 1, payments: [] });
	});

	it('appends to absent or undefined metadata', () => {
		expect(withLedger([{ key: 'other' }], []).map(({ key }) => key)).toEqual([
			'other',
			'_wcpos_payments',
		]);
		expect(withLedger(undefined, [])).toEqual([
			{ key: '_wcpos_payments', value: { schema: 1, payments: [] } },
		]);
	});
});

describe('upsertPaymentRow', () => {
	it('replaces case-insensitively or appends without mutating', () => {
		const original = [row({ id: 'ABC', amount: '1.00' })];
		const replaced = upsertPaymentRow(original, row({ id: 'abc', amount: '2.00' }));
		expect(replaced).toEqual([row({ id: 'abc', amount: '2.00' })]);
		expect(upsertPaymentRow(original, row({ id: 'new' }))).toHaveLength(2);
		expect(original).toEqual([row({ id: 'ABC', amount: '1.00' })]);
	});
});

describe('mintManualPayment', () => {
	const clock = '2026-02-03T04:05:06Z';
	function input(overrides: Partial<MintManualPaymentInput> = {}): MintManualPaymentInput {
		// Compact fixture plumbing preserves the explicit test-line budget.
		// prettier-ignore
		return {
			method: method('cash', 'manual', true), amount: '42.50', tendered: '50', currency: 'USD',
			orderId: null, cashierId: 9, storeId: 4, recordedOffline: true,
			now: () => clock, uuid: () => 'ABC-DEF',
			...overrides,
		};
	}

	it('mints a normalized captured cash row using injected identity and time', () => {
		const result = mintManualPayment(input());
		expect(result).toEqual({
			ok: true,
			row: expect.objectContaining({
				id: 'abc-def',
				order_id: 0,
				amount: '42.50',
				tendered: '50.00',
				change: '7.50',
				status: 'captured',
				recorded_offline: true,
				created_at_gmt: clock,
				captured_at_gmt: clock,
				updated_at_gmt: clock,
			}),
		});
	});

	it.each([
		['card tendered', { method: method('card', 'manual'), tendered: '50' }, 'tendered_not_allowed'],
		['cash tendered below amount', { tendered: '40' }, 'tendered_below_amount'],
		['zero amount', { amount: 0, tendered: null }, 'amount_not_positive'],
		['device method', { method: method('card', 'device'), tendered: null }, 'not_manual'],
	] as const)('rejects %s', (_name, overrides, reason) => {
		expect(mintManualPayment(input(overrides))).toEqual({ ok: false, reason });
	});
});

describe('mintServerPayment', () => {
	const input = {
		method: method('card', 'server'),
		amount: '12.345',
		currency: 'USD',
		orderId: 42,
		cashierId: 9,
		storeId: 4,
		now: () => '2026-01-01T00:00:00Z',
		uuid: () => 'ABC',
	};
	it('mints an online pending row with server fields and formatted amounts', () => {
		const result = mintServerPayment({ ...input, dp: 3 });
		expect(result).toEqual({
			ok: true,
			row: {
				...row(),
				id: 'abc',
				order_id: 42,
				method_id: 'pos_card',
				provider: 'provider',
				kind: 'card',
				capture_mode: 'server',
				amount: '12.345',
				status: 'pending',
				refunded_amount: '0.000',
				cashier_id: 9,
				store_id: 4,
				captured_at_gmt: null,
				expires_at: null,
				events: [],
				void_requested_at: null,
			},
		});
	});
	it.each([
		[{ method: method('cash', 'manual') }, 'not_server'],
		[{ amount: 0 }, 'amount_not_positive'],
		[{ amount: -1 }, 'amount_not_positive'],
		[{ orderId: null }, 'no_order_id'],
		[{ orderId: 0 }, 'no_order_id'],
		[{ orderId: 1.5 }, 'no_order_id'],
	] as const)('rejects invalid server input %o', (override, reason) => {
		expect(mintServerPayment({ ...input, ...override })).toEqual({ ok: false, reason });
	});
	it('defaults to two decimals and old rows remain readable without new fields', () => {
		expect(mintServerPayment(input)).toMatchObject({ row: { amount: '12.35' } });
		expect(readLedger(withLedger([], [row()]))).toEqual([row()]);
	});
});

describe('mintDevicePayment', () => {
	const input = {
		method: method('card', 'device'),
		amount: '12.345',
		currency: 'USD',
		orderId: 42,
		cashierId: 9,
		storeId: 4,
		now: () => '2026-01-01T00:00:00Z',
		uuid: () => 'ABC',
		transport: 'bluetooth' as const,
		recordedOffline: false,
	};
	it('mints pending device rows without claiming a capture', () => {
		expect(mintDevicePayment({ ...input, dp: 3 })).toMatchObject({
			ok: true,
			row: {
				id: 'abc',
				capture_mode: 'device',
				status: 'pending',
				transport: 'bluetooth',
				amount: '12.345',
				recorded_offline: false,
				provider_refs: {},
				captured_at_gmt: null,
			},
		});
	});
	it('allows unsaved orders only offline', () => {
		expect(mintDevicePayment({ ...input, orderId: null, recordedOffline: true })).toMatchObject({
			ok: true,
			row: { order_id: 0, recorded_offline: true },
		});
		expect(mintDevicePayment({ ...input, orderId: null })).toEqual({
			ok: false,
			reason: 'no_order_id',
		});
	});
	it('refuses another capture mode or nonpositive amounts', () => {
		expect(mintDevicePayment({ ...input, method: method('card', 'server') })).toEqual({
			ok: false,
			reason: 'not_device',
		});
		expect(mintDevicePayment({ ...input, amount: 0 })).toEqual({
			ok: false,
			reason: 'amount_not_positive',
		});
	});
});
