import * as React from 'react';

import { useAddFee } from './use-add-fee';
import { useAddProduct } from './use-add-product';
import { useAddShipping } from './use-add-shipping';
import { useAddVariation } from './use-add-variation';
import { useCustomer } from './use-customer';
import { useRemoveItem } from './use-remove-item';

interface CartHelpersContextProps {
	addCustomer: ReturnType<typeof useCustomer>['addCustomer'];
	addFee: ReturnType<typeof useAddFee>['addFee'];
	addProduct: ReturnType<typeof useAddProduct>['addProduct'];
	addShipping: ReturnType<typeof useAddShipping>['addShipping'];
	addVariation: ReturnType<typeof useAddVariation>['addVariation'];
	removeCustomer: ReturnType<typeof useCustomer>['removeCustomer'];
	removeItem: ReturnType<typeof useRemoveItem>['removeItem'];
}

export const CartHelpersContext = React.createContext<CartHelpersContextProps>(null);

interface CartHelpersProviderProps {
	children: React.ReactNode;
}

/**
 * This provider exists only to reduce the number of observable subscriptions in the app
 * - if we use addProduct hook for hundreds of components, we will have hundreds of subscriptions
 * - we can't put these helpers in the CurrentOrderProvider because it reacts to current order changes
 *
 * There may be other settings to observe in the future
 */
export const CartHelpersProvider = ({ children }: CartHelpersProviderProps) => {
	const { addFee } = useAddFee();
	const { addProduct } = useAddProduct();
	const { addShipping } = useAddShipping();
	const { addVariation } = useAddVariation();
	const { removeItem } = useRemoveItem();
	const { removeCustomer, addCustomer } = useCustomer();

	/**
	 *
	 */
	return (
		<CartHelpersContext.Provider
			value={{
				addCustomer,
				addFee,
				addProduct,
				addShipping,
				addVariation,
				removeCustomer,
				removeItem,
			}}
		>
			{children}
		</CartHelpersContext.Provider>
	);
};
