/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useOrderStatusLabel } from './use-order-status-label';

const fixture = [
	{ status: 'pos-open', label: 'POS - Open' },
	{ status: 'pos-partial', label: 'POS - Partial' },
	{ status: 'processing', label: 'Procesando' },
];
let mockStatuses: unknown = fixture;

jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (value: { orderStatuses: unknown }) => unknown) =>
		select({ orderStatuses: mockStatuses }),
}));
jest.mock('../contexts/extra-data', () => ({ useExtraData: () => ({ extraData: {} }) }));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => `t:${key}`,
}));

describe('useOrderStatusLabel', () => {
	beforeEach(() => {
		mockStatuses = fixture;
	});

	// Revert: return the server's label for pos-open, so S29 reads "POS - Open".
	it('labels the synthetic POS statuses with the app keys, not the server label', () => {
		const { result } = renderHook(() => useOrderStatusLabel());
		expect(result.current.getLabel('pos-open')).toBe('t:orders.status.pos-open');
		expect(result.current.getLabel('pos-partial')).toBe('t:orders.status.pos-partial');
	});

	it('keeps the server label for a real WooCommerce status', () => {
		const { result } = renderHook(() => useOrderStatusLabel());
		expect(result.current.getLabel('processing')).toBe('Procesando');
		expect(result.current.getLabel('unknown-status')).toBe('unknown-status');
	});

	it('uses the app keys in the select items too', () => {
		const { result } = renderHook(() => useOrderStatusLabel());
		expect(result.current.items).toEqual([
			{ label: 't:orders.status.pos-open', value: 'pos-open' },
			{ label: 't:orders.status.pos-partial', value: 'pos-partial' },
			{ label: 'Procesando', value: 'processing' },
		]);
	});

	it('labels pos-open before the server list loads', () => {
		mockStatuses = undefined;
		const { result } = renderHook(() => useOrderStatusLabel());
		expect(result.current.getLabel('pos-open')).toBe('t:orders.status.pos-open');
		expect(result.current.items).toEqual([]);
	});
});
