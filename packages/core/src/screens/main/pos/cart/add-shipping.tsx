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

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddShipping } from '../hooks/use-add-shipping';

/**
 * There is no tax class field. WooCommerce has no per-line shipping tax class — the store's
 * `shipping_tax_class` setting is the only one that exists, and the engine reads it off the
 * cart config. Offering one here authored a value the store silently discarded, which
 * surfaced as a totals-changed banner on dev-pro order 99866. See `extractShippingLineData`
 * in @wcpos/order-math. Tax STATUS is different: the POS plugin honours it server-side via
 * `woocommerce_order_item_shipping_after_calculate_taxes`, so it stays.
 */
const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
});

type FormValues = z.infer<typeof formSchema>;

/**
 *
 */
export function AddShipping() {
	const t = useT();
	const { addShipping } = useAddShipping();
	const { onOpenChange } = useRootContext();

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
		},
	});

	const handleAdd = React.useCallback(
		async (data: FormValues) => {
			const { method_title, method_id, amount, tax_status, prices_include_tax } = data;

			await addShipping({
				method_title: isEmpty(method_title) ? t('common.shipping') : (method_title ?? ''),
				method_id: isEmpty(method_id) ? 'local_pickup' : (method_id ?? ''),
				amount: isEmpty(amount) ? '0' : (amount ?? '0'),
				tax_status,
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
									testID="shipping-amount-input"
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
								<FormSwitch
									label={t('pos_cart.amount_includes_tax')}
									testID="shipping-includes-tax-switch"
									{...field}
								/>
							)}
						/>
					</View>
				</HStack>
				<FormField
					control={form.control}
					name="tax_status"
					render={({ field }) => (
						<FormRadioGroup
							label={t('common.tax_status')}
							customComponent={TaxStatusRadioGroup}
							{...field}
						/>
					)}
				/>
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
