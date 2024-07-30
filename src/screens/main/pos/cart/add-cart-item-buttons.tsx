import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@wcpos/tailwind/src/dialog';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { ModalContent } from '@wcpos/tailwind/src/modal';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { AddFee, AddFeeHandle, FeeFormValues } from './add-fee';
import { AddMiscProduct, AddMiscProductHandle, MiscProductFormValues } from './add-misc-product';
import { AddShipping, AddShippingHandle, ShippingFormValues } from './add-shipping';
import { useT } from '../../../../contexts/translations';
import { useAddFee } from '../hooks/use-add-fee';
import { useAddProduct } from '../hooks/use-add-product';
import { useAddShipping } from '../hooks/use-add-shipping';

/**
 *
 */
export const AddCartItemButtons = () => {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { addFee } = useAddFee();
	const { addShipping } = useAddShipping();
	const [addMiscProductDialogOpen, setAddMiscProductDialogOpen] = React.useState(false);
	const [addFeeDialogOpen, setAddFeeDialogOpen] = React.useState(false);
	const [addShippingDialogOpen, setAddShippingDialogOpen] = React.useState(false);

	/**
	 * Misc Product Submit
	 */
	const addMiscProductRef = React.useRef<AddMiscProductHandle>(null);

	const handleMiscProductFormSubmit = React.useCallback(
		(data: MiscProductFormValues) => {
			const { name, price, sku, tax_status, tax_class } = data;
			addProduct({
				id: 0,
				name: isEmpty(name) ? t('Product', { _tags: 'core' }) : name,
				price: isEmpty(price) ? '0' : price,
				sku,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status: tax_status ? 'taxable' : 'none',
				tax_class,
			});
			setAddMiscProductDialogOpen(false);
		},
		[addProduct, t]
	);

	/**
	 * Fee Submit
	 */
	const addFeeRef = React.useRef<AddFeeHandle>(null);

	const handleFeeFormSubmit = React.useCallback(
		(data: FeeFormValues) => {
			const {
				name,
				amount,
				percent,
				tax_status,
				tax_class,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			} = data;
			addFee({
				name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
				// total: isEmpty(total) ? '0' : total,
				amount,
				tax_status,
				tax_class,
				percent,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			});
			setAddFeeDialogOpen(false);
		},
		[addFee, t]
	);

	/**
	 * Shipping Submit
	 */
	const addShippingRef = React.useRef<AddShippingHandle>(null);

	const handleShippingFormSubmit = React.useCallback(
		(data: ShippingFormValues) => {
			const { method_title, method_id, amount, tax_status, tax_class, prices_include_tax } = data;
			addShipping({
				method_title: isEmpty(method_title) ? t('Shipping', { _tags: 'core' }) : method_title,
				method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
				amount: isEmpty(amount) ? '0' : amount,
				tax_status,
				tax_class,
				prices_include_tax,
			});
			setAddShippingDialogOpen(false);
		},
		[addShipping, t]
	);

	/**
	 *
	 */
	return (
		<VStack className="p-2">
			<HStack>
				<Text className="grow">{t('Add Miscellaneous Product', { _tags: 'core' })}</Text>
				<Dialog open={addMiscProductDialogOpen} onOpenChange={setAddMiscProductDialogOpen}>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('Add Miscellaneous Product', { _tags: 'core' })}</DialogTitle>
						</DialogHeader>
						<AddMiscProduct ref={addMiscProductRef} onSubmit={handleMiscProductFormSubmit} />
						<DialogFooter>
							<Button
								onPress={() => {
									if (addMiscProductRef.current) {
										addMiscProductRef.current.submit();
									}
								}}
							>
								<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</HStack>
			<HStack>
				<Text className="grow">{t('Add Fee', { _tags: 'core' })}</Text>
				<Dialog open={addFeeDialogOpen} onOpenChange={setAddFeeDialogOpen}>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('Add Fee', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<ErrorBoundary>
									<AddFee ref={addFeeRef} onSubmit={handleFeeFormSubmit} />
								</ErrorBoundary>
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								onPress={() => {
									if (addFeeRef.current) {
										addFeeRef.current.submit();
									}
								}}
							>
								<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</HStack>
			<HStack>
				<Text className="grow">{t('Add Shipping', { _tags: 'core' })}</Text>
				<Dialog open={addShippingDialogOpen} onOpenChange={setAddShippingDialogOpen}>
					<DialogTrigger asChild>
						<Button variant="ghost" size="icon" className="rounded-full">
							<Icon name="circlePlus" />
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('Add Shipping', { _tags: 'core' })}</DialogTitle>
							<DialogDescription>
								<ErrorBoundary>
									<AddShipping ref={addShippingRef} onSubmit={handleShippingFormSubmit} />
								</ErrorBoundary>
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								onPress={() => {
									if (addShippingRef.current) {
										addShippingRef.current.submit();
									}
								}}
							>
								<ButtonText>{t('Add to Cart', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</HStack>
		</VStack>
	);
};
