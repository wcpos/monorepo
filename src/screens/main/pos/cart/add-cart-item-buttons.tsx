import * as React from 'react';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from '@wcpos/tailwind/src/dialog';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { AddCartItemButton } from './add-cart-item-button';
import { AddFeeModal } from './add-fee-modal';
import { AddMiscProduct } from './add-misc-product';
import { AddMiscProductModal } from './add-misc-product-modal';
import { AddShippingModal } from './add-shipping-modal';
import { useT } from '../../../../contexts/translations';

export const AddCartItemButtons = () => {
	const t = useT();

	return (
		<VStack className="p-2">
			<HStack>
				<Text className="grow">{t('Add Miscellaneous Product', { _tags: 'core' })}</Text>
				<Dialog>
					<DialogTrigger>
						<Icon name="circlePlus" />
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>{t('Add Miscellaneous Product', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<AddMiscProduct />
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button onPress={() => {}}>
								<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</HStack>
			<HStack>
				<Text className="grow">{t('Add Fee', { _tags: 'core' })}</Text>
			</HStack>
			<HStack>
				<Text className="grow">{t('Add Shipping', { _tags: 'core' })}</Text>
			</HStack>
		</VStack>
	);
};
