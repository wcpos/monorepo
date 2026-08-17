import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

interface TaxDisplayProps {
	context: 'shop' | 'cart';
}

/**
 * Hook to get the tax display setting for the shop or cart.
 */
export const useTaxInclOrExcl = ({ context }: TaxDisplayProps) => {
	const { store } = useAppState();
	const taxDisplayShop = useDocField(store, (state) => state.tax_display_shop);
	const taxDisplayCart = useDocField(store, (state) => state.tax_display_cart);
	let inclOrExcl = taxDisplayShop;

	if (context === 'shop') {
		inclOrExcl = taxDisplayShop;
	}

	if (context === 'cart') {
		inclOrExcl = taxDisplayCart;
	}

	return { inclOrExcl };
};
