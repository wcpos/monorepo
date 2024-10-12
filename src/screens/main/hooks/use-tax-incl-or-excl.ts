import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

interface TaxDisplayProps {
	context: 'shop' | 'cart';
}

/**
 * Hook to get the tax display setting for the shop or cart.
 */
export const useTaxInclOrExcl = ({ context }: TaxDisplayProps) => {
	const { store } = useAppState();
	const taxDisplayShop = useObservableEagerState(store?.tax_display_shop$);
	const taxDisplayCart = useObservableEagerState(store?.tax_display_cart$);
	let inclOrExcl = taxDisplayShop;

	if (context === 'shop') {
		inclOrExcl = taxDisplayShop;
	}

	if (context === 'cart') {
		inclOrExcl = taxDisplayCart;
	}

	return { inclOrExcl };
};
