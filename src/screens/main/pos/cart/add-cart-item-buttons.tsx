import * as React from 'react';

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
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { AddCartItemButton } from './add-cart-item-button';
import { AddFee } from './add-fee';
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
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>{t('Add Miscellaneous Product', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<ErrorBoundary>
									<AddMiscProduct />
								</ErrorBoundary>
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
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>{t('Add Fee', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<ErrorBoundary>
									<AddFee />
								</ErrorBoundary>
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
				<Text className="grow">{t('Add Shipping', { _tags: 'core' })}</Text>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>{t('Add Shipping', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<ErrorBoundary>
									<AddMiscProduct />
								</ErrorBoundary>
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
		</VStack>
	);
};
