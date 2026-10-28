import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	SavedFieldProvider,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { PropertyList } from '@wcpos/components/property-row';

import { useT } from '../../../../../../contexts/translations';
import { FormAmountField } from '../../../../components/amount-field';
import { FormErrors } from '../../../../components/form-errors';
import { metaDataSchema } from '../../../../components/meta-data-form';
import { taxClassFromWire, taxClassToWire } from '../../../../hooks/tax-class';
import { useFeeLineData } from '../../../hooks/use-fee-line-data';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useUpdateCartLine } from '../../../hooks/use-update-cart-line';
import { AmountRow, CartLineRow, CustomFieldRows, TaxRow } from '../cart-line-rows';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	amount: z.number().optional(),
	percent: z.boolean().default(false),
	percent_of_cart_total_with_tax: z.boolean().optional(),
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: import('@wcpos/query').OrderFeeLine;
}

export function EditFeeLineForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditFeeLineFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditFeeLineFormFields({ uuid, item }: Props) {
	const t = useT();
	const { updateCartLine } = useUpdateCartLine();
	// The order this sheet belongs to: a debounced write that lands after the sheet closed and
	// another order was selected still reaches it.
	const { currentOrderRecord } = useCurrentOrder();
	const markSaved = useMarkSaved();
	const { getFeeLineData } = useFeeLineData();
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
		getFeeLineData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(
			formSchema.extend({
				amount: z.number().min(0, t('pos_cart.fee_amount_negative')).optional(),
			}) as never
		) as never,
		defaultValues: {
			name: item.name ?? undefined,
			amount: toNumber(amount),
			percent,
			tax_status: item.tax_status ?? 'taxable',
			tax_class: taxClassFromWire(item.tax_class),
			prices_include_tax,
			percent_of_cart_total_with_tax,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	useFormChangeHandler({
		form,
		onChange: (changes) => {
			const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
			const value = form.getValues(root);
			const wireValue =
				root === 'tax_class'
					? taxClassToWire(form.getValues('tax_class'))
					: root === 'amount'
						? String(value)
						: value;
			return updateCartLine(
				'fee_lines',
				uuid,
				{ [root]: wireValue },
				{ record: currentOrderRecord }
			).then((written) => {
				if (written) markSaved([root]);
				return Boolean(written);
			});
		},
	});

	/**
	 * Watch for changes to `percent`
	 */
	const togglePercentage = useWatch({ control: form.control, name: 'percent' });

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList testID="fee-line-form">
					<CartLineRow prefix="fee-line" id="name" label={t('pos_cart.fee_name')} mark="name">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormInput
									testID="edit-fee-line-name-input"
									placeholder={t('pos_cart.fee')}
									{...field}
								/>
							)}
						/>
					</CartLineRow>
					<AmountRow
						prefix="fee-line"
						percent={togglePercentage}
						onPercent={(next) => form.setValue('percent', next)}
						mark={['amount', 'percent']}
					>
						<FormField
							control={form.control}
							name="amount"
							render={({ field }) => (
								<FormAmountField
									kind={togglePercentage ? 'percent' : 'money'}
									testID="edit-fee-line-amount-input"
									{...field}
								/>
							)}
						/>
					</AmountRow>
					<CartLineRow
						prefix="fee-line"
						id="includes-tax"
						label={t('pos_cart.amount_includes_tax')}
						mark="prices_include_tax"
						toggle={
							<FormField
								control={form.control}
								name="prices_include_tax"
								render={({ field }) => (
									<FormSwitch testID="edit-fee-line-includes-tax-switch" {...field} />
								)}
							/>
						}
					/>
					<TaxRow prefix="fee-line" />
					<CustomFieldRows prefix="fee-line" meta={item.meta_data} />
				</PropertyList>
			</DialogBody>
			<DialogFooter close />
		</Form>
	);
}
