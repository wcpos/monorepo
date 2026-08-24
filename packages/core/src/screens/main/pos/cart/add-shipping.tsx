import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
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
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { shippingTaxClassFromStore, taxClassToWire } from '../../hooks/tax-class';
import { useAddShipping } from '../hooks/use-add-shipping';

const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 *
 */
export function AddShipping() {
	const t = useT();
	const { addShipping } = useAddShipping();
	const { onOpenChange } = useRootContext();
	const { store } = useAppState();
	const shippingTaxClass = useDocField(store, (value) => value.shipping_tax_class);

	/**
	 *
	 */
	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			method_title: '',
			method_id: '',
			amount: '0',
			prices_include_tax: true,
			tax_status: 'taxable',
			// The store's setting is a wire value and may be WooCommerce's 'inherit'
			// sentinel; the field holds a UI tax class. See shippingTaxClassFromStore.
			tax_class: shippingTaxClassFromStore(shippingTaxClass as string | undefined),
		},
	});

	const handleAdd = React.useCallback(
		async (data: FormValues) => {
			const { method_title, method_id, amount, tax_status, tax_class, prices_include_tax } = data;

			await addShipping({
				method_title: isEmpty(method_title) ? t('common.shipping') : (method_title ?? ''),
				method_id: isEmpty(method_id) ? 'local_pickup' : (method_id ?? ''),
				amount: isEmpty(amount) ? '0' : (amount ?? '0'),
				tax_status,
				tax_class: taxClassToWire(tax_class),
				prices_include_tax: prices_include_tax ?? true,
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
									label={t('pos_cart.shipping_method_title')}
									placeholder={t('common.shipping')}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="method_id"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={ShippingMethodSelect}
									label={t('pos_cart.shipping_method')}
									value={value ?? ''}
									onChange={onChange}
									{...rest}
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
									label={t('pos_cart.amount')}
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
								<FormSwitch label={t('pos_cart.amount_includes_tax')} {...field} />
							)}
						/>
					</View>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									label={t('common.tax_class')}
									customComponent={TaxClassSelect}
									value={value ?? ''}
									onChange={onChange}
									{...rest}
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
									label={t('common.tax_status')}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('common.cancel')}</DialogClose>
					<DialogAction
						disabled={form.formState.isSubmitting}
						testID="add-to-cart-submit"
						onPress={onAdd}
					>
						{t('common.add_to_cart')}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
}
