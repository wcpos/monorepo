import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { AddCartItemButton } from './add-cart-item-button';
import { AddFee } from './add-fee';
import { AddMiscProduct } from './add-misc-product';
import { AddShipping } from './add-shipping';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const AddCartItemButtons = () => {
	const t = useT();
	/**
	 *
	 */
	return (
		<VStack className="gap-1 p-2">
			<HStack testID="add-misc-product">
				<Text className="flex-1">{t('pos_cart.add_miscellaneous_product')}</Text>
				<AddCartItemButton title={t('pos_cart.add_miscellaneous_product')}>
					<AddMiscProduct />
				</AddCartItemButton>
			</HStack>
			<HStack testID="add-fee">
				<Text className="flex-1">{t('pos_cart.add_fee')}</Text>
				<AddCartItemButton title={t('pos_cart.add_fee')}>
					<AddFee />
				</AddCartItemButton>
			</HStack>
			<HStack testID="add-shipping">
				<Text className="flex-1">{t('pos_cart.add_shipping')}</Text>
				<AddCartItemButton title={t('pos_cart.add_shipping')}>
					<AddShipping />
				</AddCartItemButton>
			</HStack>
		</VStack>
	);
};
