/** @jest-environment jsdom */
import * as React from 'react';

import { render, renderHook } from '@testing-library/react';

import { CommandsProvider, useCommandContext } from './provider';
import { registerCommand, resetCommandRegistry, runCommand } from './registry';
import { registerSurface, resetSurfaces, SurfaceNotMountedError } from './surfaces';

import type { CommandContext } from './types';

const mockLog = jest.fn();
const mockSetCurrentOrderID = jest.fn();
const mockSelectReceipt = jest.fn();
let mockSegments: string[] = [];
let mockStage: 'cart' | 'checkout' | 'receipt' = 'cart';
let mockMode = { receiptOrders: new Set<string>(), selectedReceiptOrder: null as string | null };
let mockCurrent: { uuid: string; isNew?: boolean; payload: Record<string, unknown[]> };
let mockOpenOrders: { id: string }[] = [];

jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));
jest.mock('@wcpos/query', () => ({
	useRecordField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../screens/main/pos/hooks/use-action-context', () => ({
	useActionContext: () => ({ ctx: mockActionCtx }),
}));
const mockActionCtx = Object.freeze({ log: (...args: unknown[]) => mockLog(...args) });
jest.mock('../../screens/main/pos/contexts/current-order/context', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockCurrent, openOrders: mockOpenOrders }),
	useCurrentOrderActions: () => mockActions,
}));
const mockActions = {
	getCurrentOrderRecord: () => mockCurrent,
	setCurrentOrderID: (id: string) => mockSetCurrentOrderID(id),
};
jest.mock('../../screens/main/pos/checkout/checkout-mode', () => ({
	useCheckoutMode: () => mockMode,
	getCheckoutModeSnapshot: () => mockMode,
	useOrderCheckoutStage: () => mockStage,
	selectReceipt: (id: string | null) => mockSelectReceipt(id),
}));

function renderContext() {
	const { result } = renderHook(() => ({ ctx: useCommandContext() }), {
		wrapper: CommandsProvider,
	});
	return result.current;
}

beforeEach(() => {
	jest.clearAllMocks();
	resetSurfaces();
	resetCommandRegistry();
	mockSegments = ['(app)', '(drawer)', '(pos)', '(columns)', 'cart'];
	mockStage = 'cart';
	mockMode = { receiptOrders: new Set(), selectedReceiptOrder: null };
	mockOpenOrders = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	mockCurrent = { uuid: 'c', payload: { line_items: [{}], fee_lines: [{}], shipping_lines: [] } };
});

it('throws outside the provider', () => {
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	function Orphan() {
		useCommandContext();
		return null;
	}
	expect(() => render(<Orphan />)).toThrow(/CommandsProvider/);
});

it('is frozen and carries the action context', () => {
	const { ctx } = renderContext();
	expect(Object.isFrozen(ctx)).toBe(true);
	expect(Object.isFrozen(ctx.screen)).toBe(true);
	ctx.log('info', 'hello');
	expect(mockLog).toHaveBeenCalledWith('info', 'hello');
});

it('openCheckout invokes the registered pay surface, and rejects with none mounted', async () => {
	const { ctx } = renderContext();
	await expect(ctx.navigate.openCheckout()).rejects.toBeInstanceOf(SurfaceNotMountedError);
	const pay = jest.fn();
	const detach = registerSurface('pay', pay);
	await ctx.navigate.openCheckout();
	expect(pay).toHaveBeenCalledTimes(1);
	detach();
	await expect(ctx.navigate.openCheckout()).rejects.toBeInstanceOf(SurfaceNotMountedError);
});

it('void and focus invoke their surfaces; hasSurface reads the live registry', async () => {
	const { ctx } = renderContext();
	expect(ctx.hasSurface('void')).toBe(false);
	const handlers = { void: jest.fn(), search: jest.fn(), discount: jest.fn() };
	for (const [target, handler] of Object.entries(handlers))
		registerSurface(target as keyof typeof handlers, handler);
	await ctx.cart.void();
	await ctx.focus('search');
	await ctx.focus('discount');
	for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledTimes(1);
	expect(ctx.hasSurface('void')).toBe(true);
});

it('selectOrder steps through the open carts, wrapping and skipping receipts', async () => {
	mockMode = { receiptOrders: new Set(['b']), selectedReceiptOrder: null };
	const { ctx } = renderContext();
	await ctx.cart.selectOrder('next'); // from c, wraps to a
	expect(mockSetCurrentOrderID).toHaveBeenLastCalledWith('a');
	expect(mockSelectReceipt).toHaveBeenLastCalledWith(null);
	mockCurrent = { ...mockCurrent, uuid: 'a' };
	await ctx.cart.selectOrder('next'); // b is a receipt
	expect(mockSetCurrentOrderID).toHaveBeenLastCalledWith('c');
	await ctx.cart.selectOrder('previous'); // from a, wraps to c
	expect(mockSetCurrentOrderID).toHaveBeenLastCalledWith('c');
});

it('steps from the blank cart to the first or the last cart', async () => {
	mockCurrent = { uuid: 'tmp', isNew: true, payload: {} };
	const { ctx } = renderContext();
	await ctx.cart.selectOrder('next');
	expect(mockSetCurrentOrderID).toHaveBeenLastCalledWith('a');
	await ctx.cart.selectOrder('previous');
	expect(mockSetCurrentOrderID).toHaveBeenLastCalledWith('c');
});

it('selects an open order by uuid and rejects an unknown one', async () => {
	const { ctx } = renderContext();
	await ctx.cart.selectOrder('b');
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('b');
	await expect(ctx.cart.selectOrder('zzz')).rejects.toThrow(/zzz/);
	expect(mockSetCurrentOrderID).toHaveBeenCalledTimes(1);
});

it('newOrder selects the blank cart', async () => {
	const { ctx } = renderContext();
	await ctx.cart.newOrder();
	expect(mockSelectReceipt).toHaveBeenCalledWith(null);
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
});

it('screen reflects the cart, checkout mode, the sheet route and receipts', () => {
	expect(renderContext().ctx.screen).toEqual({
		route: 'cart',
		hasOpenOrder: true,
		openOrderCount: 3,
		lineCount: 2,
	});
	mockStage = 'checkout';
	expect(renderContext().ctx.screen.route).toBe('checkout');
	mockStage = 'cart';
	mockSegments = [...mockSegments.slice(0, 3), '(modals)', 'cart', '[orderId]', 'checkout'];
	expect(renderContext().ctx.screen.route).toBe('checkout');
	mockSegments = ['(app)', '(drawer)', '(pos)', 'cart'];
	mockMode = { receiptOrders: new Set(['a']), selectedReceiptOrder: 'a' };
	expect(renderContext().ctx.screen).toMatchObject({ route: 'other', openOrderCount: 2 });
	mockMode = { receiptOrders: new Set(), selectedReceiptOrder: null };
	mockSegments = ['(app)', '(drawer)', 'settings'];
	expect(renderContext().ctx.screen.route).toBe('other');
	mockSegments = ['(app)', '(drawer)', '(pos)', 'cart'];
	mockCurrent = { uuid: 'tmp', isNew: true, payload: {} };
	expect(renderContext().ctx.screen).toMatchObject({ hasOpenOrder: false, lineCount: 0 });
});

it('runCommand runs a registered command against the context', async () => {
	const run = jest.fn(async (ctx: CommandContext) => ctx.cart.newOrder());
	registerCommand({ id: 'pos.cart.new', label: 'pos_commands.cart_new', run });
	const { ctx } = renderContext();
	await expect(runCommand('pos.cart.new', ctx, { source: 'test' })).resolves.toEqual({
		outcome: 'ran',
	});
	expect(run).toHaveBeenCalledWith(ctx, undefined);
	expect(mockSetCurrentOrderID).toHaveBeenCalledWith('');
});
