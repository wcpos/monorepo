import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
} from '@wcpos/components/form';
import { PropertyList, PropertyRow } from '@wcpos/components/property-row';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxStatusRadioGroup } from '../../components/tax-radio-groups';
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
	const { close: closeDialog } = useDialog();

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
			closeDialog();
		},
		[addShipping, closeDialog, t]
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
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList>
					<PropertyRow
						label={t('pos_cart.shipping_method_title')}
						nativeID="shipping-title-form-item"
					>
						<FormField
							control={form.control}
							name="method_title"
							render={({ field }) => (
								<FormItem nativeID="shipping-title">
									<FormInput placeholder={t('common.shipping')} {...field} />
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow label={t('pos_cart.shipping_method')} nativeID="shipping-method-form-item">
						<FormField
							control={form.control}
							name="method_id"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormItem nativeID="shipping-method">
									<FormSelect
										customComponent={ShippingMethodSelect}
										value={value ?? ''}
										onChange={onChange}
										{...rest}
									/>
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow label={t('pos_cart.amount')} nativeID="shipping-amount-form-item">
						<FormField
							control={form.control}
							name="amount"
							render={({ field }) => (
								<FormItem nativeID="shipping-amount">
									<FormInput
										customComponent={CurrencyInput}
										testID="shipping-amount-input"
										{...field}
									/>
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow
						label={t('pos_cart.amount_includes_tax')}
						nativeID="shipping-includes-tax-form-item"
						trailing={
							<FormField
								control={form.control}
								name="prices_include_tax"
								render={({ field }) => (
									<FormItem nativeID="shipping-includes-tax">
										<FormSwitch testID="shipping-includes-tax-switch" {...field} />
									</FormItem>
								)}
							/>
						}
					/>
					<PropertyRow label={t('common.tax')} nativeID="shipping-tax-form-item">
						<FormField
							control={form.control}
							name="tax_status"
							render={({ field }) => (
								<FormItem nativeID="shipping-tax">
									<FormRadioGroup customComponent={TaxStatusRadioGroup} {...field} />
								</FormItem>
							)}
						/>
					</PropertyRow>
				</PropertyList>
			</DialogBody>
			<DialogFooter
				close
				intent={{
					label: t('common.add_to_cart'),
					disabled: form.formState.isSubmitting,
					testID: 'add-to-cart-submit',
					onPress: () => void onAdd(),
				}}
			/>
		</Form>
	);
}
