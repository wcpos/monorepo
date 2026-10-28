import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	SavedFieldProvider,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { PropertyList } from '@wcpos/components/property-row';

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { metaDataSchema } from '../../../../components/meta-data-form';
import { ShippingMethodSelect } from '../../../../components/shipping-method-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-radio-groups';
import { useShippingLineData } from '../../../hooks/use-shipping-line-data';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useUpdateCartLine } from '../../../hooks/use-update-cart-line';
import { AmountRow, CartLineRow, CustomFieldRows } from '../cart-line-rows';

/**
 * No tax class field — same reason as the Add shipping dialog: WooCommerce has no
 * per-line shipping tax class, so the store's `shipping_tax_class` setting is the only
 * one there is. See `extractShippingLineData` in @wcpos/order-math. Tax STATUS stays:
 * the POS plugin honours it server-side. The instance ID is a developer fact: the JSON tab shows it
 * (property rows rule 10), and the record keeps it because only changed roots are written.
 */
const formSchema = z.object({
	method_title: z.string().optional(),
	method_id: z.string().optional(),
	amount: z.number().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: import('@wcpos/query').OrderShippingLine;
}

/**
 *
 */
export function EditShippingLineForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditShippingLineFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditShippingLineFormFields({ uuid, item }: Props) {
	const t = useT();
	const { updateCartLine } = useUpdateCartLine();
	// The order this sheet belongs to: a debounced write that lands after the sheet closed and
	// another order was selected still reaches it.
	const { currentOrderRecord } = useCurrentOrder();
	const markSaved = useMarkSaved();
	const { getShippingLineData } = useShippingLineData();
	const { amount, tax_status, prices_include_tax } = getShippingLineData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			method_title: item.method_title ?? undefined,
			method_id: item.method_id ?? undefined,
			amount: toNumber(amount),
			prices_include_tax,
			tax_status,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	useFormChangeHandler({
		form,
		onChange: (changes) => {
			const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
			const value = form.getValues(root);
			const wireValue = value;
			return updateCartLine(
				'shipping_lines',
				uuid,
				{ [root]: wireValue },
				{ record: currentOrderRecord }
			).then((written) => {
				if (written) markSaved([root]);
				return Boolean(written);
			});
		},
	});

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList testID="shipping-line-form">
					<CartLineRow
						prefix="shipping-line"
						id="method_title"
						label={t('pos_cart.shipping_method_title')}
						mark="method_title"
					>
						<FormField
							control={form.control}
							name="method_title"
							render={({ field }) => (
								<FormInput testID="edit-shipping-line-method_title-input" {...field} />
							)}
						/>
					</CartLineRow>
					<CartLineRow
						prefix="shipping-line"
						id="method_id"
						label={t('pos_cart.shipping_method')}
						mark="method_id"
					>
						<FormField
							control={form.control}
							name="method_id"
							render={({ field }) => (
								<FormSelect
									customComponent={ShippingMethodSelect}
									{...field}
									value={field.value ?? ''}
								/>
							)}
						/>
					</CartLineRow>
					<AmountRow prefix="shipping-line" mark="amount">
						<FormField
							control={form.control}
							name="amount"
							render={({ field }) => (
								<FormInput
									customComponent={CurrencyInput}
									testID="edit-shipping-line-amount-input"
									type="numeric"
									{...field}
								/>
							)}
						/>
					</AmountRow>
					<CartLineRow
						prefix="shipping-line"
						id="includes-tax"
						label={t('pos_cart.amount_includes_tax')}
						mark="prices_include_tax"
						toggle={
							<FormField
								control={form.control}
								name="prices_include_tax"
								render={({ field }) => (
									<FormSwitch testID="edit-shipping-line-includes-tax-switch" {...field} />
								)}
							/>
						}
					/>
					<CartLineRow prefix="shipping-line" id="tax" label={t('common.tax')} mark="tax_status">
						<FormField
							control={form.control}
							name="tax_status"
							render={({ field }) => (
								<FormRadioGroup customComponent={TaxStatusRadioGroup} {...field} />
							)}
						/>
					</CartLineRow>
					<CustomFieldRows prefix="shipping-line" meta={item.meta_data} />
				</PropertyList>
			</DialogBody>
			<DialogFooter close />
		</Form>
	);
}
