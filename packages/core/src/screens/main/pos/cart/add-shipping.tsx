import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddShipping } from '../hooks/use-add-shipping';

const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
});

/**
 *
 */
export const AddShipping = () => {
	const t = useT();
	const { addShipping } = useAddShipping();
	const { onOpenChange } = useRootContext();
	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			method_title: '',
			method_id: '',
			amount: '0',
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: shippingTaxClass,
		},
	});

	/**
	 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
	 */
	const handleAdd = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
			const { method_title, method_id, amount, tax_status, tax_class, prices_include_tax } = data;

			addShipping({
				method_title: isEmpty(method_title) ? t('Shipping') : method_title,
				method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
				amount: isEmpty(amount) ? '0' : amount,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				prices_include_tax,
			});
			onOpenChange(false);
		},
		[addShipping, onOpenChange, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onAdd = form.handleSubmit(handleAdd);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="method_title"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('Shipping Method Title')}
									placeholder={t('Shipping')}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="method_id"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={ShippingMethodSelect}
									label={t('Shipping Method')}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('Amount')}
									{...field}
								/>
							</View>
						)}
					/>
					<View className="flex-1 justify-center">
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormSwitch label={t('Amount Includes Tax')} {...field} />
							)}
						/>
					</View>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									label={t('Tax Class')}
									customComponent={TaxClassSelect}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('Tax Status')}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel')}</DialogClose>
					<DialogAction onPress={onAdd}>{t('Add to Cart')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
