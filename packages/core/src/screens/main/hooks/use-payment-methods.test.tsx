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

	it('drops a structurally unusable method and keeps the rest', () => {
		// One malformed gateway must not stop the till taking cash on the others.
		paymentMethods = {
			schema: 1,
			contract: '1.0',
			methods: [null, cash, { title: 'No id' }, { id: 'broken', title: 'No capture block' }],
		};

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ methods: [cash], loaded: true });
		expect(result.current.byId.get('pos_cash')).toEqual(cash);
	});

	it('keeps a method whose enum values are unknown (disabled-with-reason, not dropped)', () => {
		const future = { ...cash, id: 'future', capture: { ...cash.capture, mode: 'teleport' } };
		paymentMethods = { schema: 1, contract: '1.0', methods: [future] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current.methods).toEqual([future]);
	});

	it('stays unloaded when every advertised method is malformed', () => {
		// A broken payload must leave the legacy checkout available, not an empty tile grid.
		paymentMethods = { schema: 1, contract: '1.0', methods: [null, { id: 'broken' }] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ methods: [], loaded: false });
	});

	it('treats a genuinely empty advertised list as loaded', () => {
		paymentMethods = { schema: 1, contract: '1.0', methods: [] };

		const { result } = renderHook(() => usePaymentMethods());

		expect(result.current).toMatchObject({ methods: [], loaded: true });
	});
});
