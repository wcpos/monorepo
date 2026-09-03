/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { usePaymentMethods } from './use-payment-methods';

const cash = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	kind: 'cash',
	pos_enabled: true,
	order: 1,
	capture: { mode: 'manual', provider: null, hardware: null, webview_available: false },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'none',
		offline: 'record',
		void: false,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	provider_data: {},
} as const;

let paymentMethods: unknown;

jest.mock('@wcpos/query', () => ({
	useDocField: (_document: unknown, selector: (value: Record<string, unknown>) => unknown) =>
		selector({ paymentMethods }),
}));
jest.mock('../contexts/extra-data', () => ({
	useExtraData: () => ({ extraData: {} }),
}));

describe('usePaymentMethods', () => {
	it('returns the loaded envelope and indexes methods without reordering them', () => {
		paymentMethods = { schema: 1, contract: '1.0', methods: [cash] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ methods: [cash], contract: '1.0', loaded: true });
		expect(result.current.byId.get('pos_cash')).toBe(cash);
		expect(result.current.unsupportedSchema).toBe(false);
	});

	it('returns an unloaded empty inventory when the envelope is missing', () => {
		paymentMethods = undefined;

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toEqual({
			methods: [],
			byId: new Map(),
			contract: null,
			loaded: false,
			unsupportedSchema: false,
		});
	});

	it('marks a fetched newer schema as unsupported', () => {
		paymentMethods = { schema: 2, contract: '2.0', methods: [] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ loaded: true, unsupportedSchema: true });
	});

	it('rejects an envelope containing a null payment method', () => {
		paymentMethods = { schema: 1, contract: '1.0', methods: [null] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ methods: [], loaded: false });
	});
});
