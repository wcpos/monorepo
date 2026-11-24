/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useTillEntry, useTillLocation, useTillOrderId } from './use-till-location';

let mockSegments: string[] = [];
let mockParams: { orderId?: string | string[] } = {};
jest.mock('expo-router', () => ({
	useSegments: () => mockSegments,
	useGlobalSearchParams: () => mockParams,
}));

const pos = ['(app)', '(drawer)', '(pos)'];
const routes = {
	columnsCart: [...pos, '(columns)', 'cart', '[...orderId]'],
	tabsCart: [...pos, '(tabs)', 'cart', '[...orderId]'],
	columns: [...pos, '(columns)'],
	checkout: [...pos, '(modals)', 'cart', '[orderId]', 'checkout'],
	receipt: [...pos, '(modals)', 'cart', 'receipt', '[orderId]'],
	misc: [...pos, '(modals)', 'cart', 'add-misc-product'],
	settings: ['(app)', '(drawer)', 'settings'],
	settingsModal: ['(app)', '(modals)', 'settings'],
};

/** Mounts the hooks once and walks them through route states, as the mounted (pos) layout does. */
function walk() {
	mockSegments = routes.columns;
	mockParams = {};
	const view = renderHook(() => {
		const location = useTillLocation();
		return { ...location, tillOrderId: useTillOrderId(location) };
	});
	return (segments: string[], orderId?: string | string[]) => {
		mockSegments = segments;
		mockParams = orderId === undefined ? {} : { orderId };
		view.rerender();
		return view.result.current;
	};
}

it('follows the till through checkout, receipt and back, never a sheet (#3150)', () => {
	const go = walk();
	expect(go(routes.columnsCart, ['A'])).toMatchObject({
		inPos: true,
		sheet: null,
		atCart: true,
		tillOrderId: 'A',
	});
	expect(go(routes.checkout, 'B')).toMatchObject({
		sheet: 'checkout',
		atCart: true,
		tillOrderId: 'A',
	});
	expect(go(routes.receipt, 'B')).toMatchObject({ sheet: 'receipt', tillOrderId: 'A' });
	expect(go(routes.columnsCart, ['A'])).toMatchObject({ sheet: null, tillOrderId: 'A' });
});

it('switches to a second till order and to a new cart', () => {
	const go = walk();
	go(routes.columnsCart, ['A']);
	expect(go(routes.columnsCart, ['C']).tillOrderId).toBe('C');
	expect(go(routes.tabsCart, ['D']).tillOrderId).toBe('D');
	expect(go(routes.columnsCart, []).tillOrderId).toBeUndefined();
	expect(go(routes.columns).tillOrderId).toBeUndefined();
});

it('keeps the last cart order outside the POS and on return to a sheet', () => {
	const go = walk();
	go(routes.columnsCart, ['A']);
	go(routes.columnsCart, ['C']);
	expect(go(routes.settings)).toMatchObject({ inPos: false, sheet: null, tillOrderId: 'C' });
	expect(go(routes.settingsModal)).toMatchObject({
		inPos: false,
		sheet: 'other',
		tillOrderId: 'C',
	});
	expect(go(routes.checkout, 'B').tillOrderId).toBe('C');
});

it("remembers the till order, never a sheet's, for the routes outside the POS (#3150)", () => {
	const go = walk();
	go(routes.columnsCart, ['A']);
	go(routes.checkout, 'B');
	expect(go(routes.settings).tillOrderId).toBe('A');
});

it('gives a cold-loaded sheet no till order', () => {
	const go = walk();
	expect(go(routes.checkout, 'B')).toMatchObject({ sheet: 'checkout', tillOrderId: undefined });
	expect(go(routes.misc)).toMatchObject({ sheet: 'other', tillOrderId: undefined });
});

it('reads the catch-all param as a checkout seed', () => {
	const go = walk();
	expect(go(routes.columnsCart, ['A', 'checkout', 'cash']).seed).toEqual({
		orderId: 'A',
		checkout: true,
		methodId: 'cash',
	});
	expect(go(routes.columnsCart, ['A']).seed).toEqual({ orderId: 'A', checkout: false });
	expect(go(routes.checkout, 'B').seed).toEqual({ orderId: 'B', checkout: false });
});

const pages = {
	orders: ['(app)', '(drawer)', 'orders'],
	orderModal: ['(app)', '(drawer)', 'orders', '(modals)', 'view', '[orderId]'],
};

/** Mounts the entry count on the till at order A and walks it, as the mounted (pos) layout does. */
function walkEntries() {
	mockSegments = routes.columnsCart;
	mockParams = { orderId: ['A'] };
	const view = renderHook(() => useTillEntry(useTillLocation()));
	return (segments: string[], orderId?: string | string[]) => {
		mockSegments = segments;
		mockParams = orderId === undefined ? {} : { orderId };
		view.rerender();
		return view.result.current;
	};
}

describe('useTillEntry (#3773)', () => {
	it('does not count a modal round trip over the till', () => {
		const go = walkEntries();
		const start = go(routes.columnsCart, ['A']);
		go(routes.settingsModal);
		expect(go(routes.columnsCart, ['A'])).toBe(start);
	});

	it('counts leaving for a page and returning', () => {
		const go = walkEntries();
		const start = go(routes.columnsCart, ['A']);
		go(routes.settings);
		expect(go(routes.columnsCart, ['A'])).toBe(start + 1);
	});

	it('counts a page, then its modal, then straight back into the till (send again)', () => {
		const go = walkEntries();
		const start = go(routes.columnsCart, ['A']);
		go(pages.orders);
		go(pages.orderModal, 'A');
		expect(go(routes.columnsCart, ['A'])).toBe(start + 1);
	});

	it('never counts two modal round trips in a row', () => {
		const go = walkEntries();
		const start = go(routes.columnsCart, ['A']);
		go(routes.settingsModal);
		expect(go(routes.columnsCart, ['A'])).toBe(start);
		go(routes.settingsModal);
		expect(go(routes.columnsCart, ['A'])).toBe(start);
	});
});
