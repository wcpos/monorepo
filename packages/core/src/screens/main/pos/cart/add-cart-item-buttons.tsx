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
			{/* <Button variant="outline" onPress={() => router.push('(modals)/cart/add-misc-product')}>
				<Text>{t('Add Miscellaneous Product', { _tags: 'core' })}</Text>
			</Button> */}
			<HStack>
				<Text className="flex-1">{t('Add Miscellaneous Product', { _tags: 'core' })}</Text>
				<AddCartItemButton title={t('Add Miscellaneous Product', { _tags: 'core' })}>
					<AddMiscProduct />
				</AddCartItemButton>
			</HStack>
			<HStack>
				<Text className="flex-1">{t('Add Fee', { _tags: 'core' })}</Text>
				<AddCartItemButton title={t('Add Fee', { _tags: 'core' })}>
					<AddFee />
				</AddCartItemButton>
			</HStack>
			<HStack>
				<Text className="flex-1">{t('Add Shipping', { _tags: 'core' })}</Text>
				<AddCartItemButton title={t('Add Shipping', { _tags: 'core' })}>
					<AddShipping />
				</AddCartItemButton>
			</HStack>
		</VStack>
	);
};
