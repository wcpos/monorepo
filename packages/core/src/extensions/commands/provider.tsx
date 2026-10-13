import * as React from 'react';

import { useSegments } from 'expo-router';

import { useRecordField } from '@wcpos/query';

import { hasSurface, invokeSurface } from './surfaces';
import {
	getCheckoutModeSnapshot,
	selectReceipt,
	useCheckoutMode,
	useOrderCheckoutStage,
} from '../../screens/main/pos/checkout/checkout-mode';
import {
	useCurrentOrder,
	useCurrentOrderActions,
} from '../../screens/main/pos/contexts/current-order/context';
import { useActionContext } from '../../screens/main/pos/hooks/use-action-context';

import type { CommandContext } from './types';

const CommandContextReact = React.createContext<CommandContext | null>(null);

/** At the POS root; `children` pass through, so its re-render on a cart write stops here. */
export function CommandsProvider({ children }: { children: React.ReactNode }) {
	const { ctx: actionCtx } = useActionContext();
	const { currentOrderRecord, openOrders } = useCurrentOrder();
	const { getCurrentOrderRecord, setCurrentOrderID } = useCurrentOrderActions();
	const { receiptOrders, selectedReceiptOrder } = useCheckoutMode();
	const stage = useOrderCheckoutStage(currentOrderRecord);
	const segments: string[] = useSegments();
	const lineCount = useRecordField(
		currentOrderRecord,
		(order) =>
			(order.payload.line_items?.length ?? 0) +
			(order.payload.fee_lines?.length ?? 0) +
			(order.payload.shipping_lines?.length ?? 0)
	);
	const hasOpenOrder = !(currentOrderRecord as { isNew?: boolean }).isNew;
	const openOrderCount = openOrders.filter(({ id }) => !receiptOrders.has(id)).length;
	const route =
		!segments.includes('(pos)') ||
		segments.includes('receipt') ||
		selectedReceiptOrder !== null ||
		stage === 'receipt'
			? 'other'
			: segments.includes('checkout') || stage === 'checkout'
				? 'checkout'
				: 'cart';

	const ctx = React.useMemo<CommandContext>(() => {
		// As the tab strip's press: a receipt is selected over the cart, an order clears it.
		const select = (id: string) => {
			if (getCheckoutModeSnapshot().receiptOrders.has(id)) return selectReceipt(id);
			selectReceipt(null);
			setCurrentOrderID(id);
		};
		return Object.freeze({
			...actionCtx,
			navigate: Object.freeze({ openCheckout: () => invokeSurface('pay') }),
			cart: Object.freeze({
				newOrder: async () => select(''),
				selectOrder: async (target: string) => {
					if (target !== 'previous' && target !== 'next') {
						if (!openOrders.some(({ id }) => id === target))
							throw new Error(`No open order "${target}"`);
						return select(target);
					}
					// The strip's order, receipts skipped; the blank cart sits past the last cart.
					const receipts = getCheckoutModeSnapshot().receiptOrders;
					const carts = openOrders.map(({ id }) => id).filter((id) => !receipts.has(id));
					if (carts.length === 0) return;
					const at = carts.indexOf(getCurrentOrderRecord().uuid);
					const step = target === 'next' ? 1 : -1;
					const index =
						at < 0 ? (step > 0 ? 0 : carts.length - 1) : (at + step + carts.length) % carts.length;
					select(carts[index]);
				},
				void: () => invokeSurface('void'),
			}),
			focus: (target: 'search' | 'discount') => invokeSurface(target),
			hasSurface,
			screen: Object.freeze({ route, hasOpenOrder, openOrderCount, lineCount }),
		});
	}, [
		actionCtx,
		getCurrentOrderRecord,
		setCurrentOrderID,
		openOrders,
		route,
		hasOpenOrder,
		openOrderCount,
		lineCount,
	]);

	return <CommandContextReact.Provider value={ctx}>{children}</CommandContextReact.Provider>;
}

export function useCommandContext(): CommandContext {
	const ctx = React.useContext(CommandContextReact);
	if (!ctx) throw new Error('useCommandContext must be called within CommandsProvider');
	return ctx;
}
