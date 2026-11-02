import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormSwitch, SavedFieldProvider } from '@wcpos/components/form';
import { PropertyList, PropertyRow } from '@wcpos/components/property-row';

import { useT } from '../../../../../../contexts/translations';
import { FormAmountField } from '../../../../components/amount-field';
import { FormErrors } from '../../../../components/form-errors';
import { metaDataSchema } from '../../../../components/meta-data-form';
import { taxClassFromWire } from '../../../../hooks/tax-class';
import { useFeeLineData } from '../../../hooks/use-fee-line-data';
import { AmountRow, CustomFieldRows, feeAmountSchema, TaxRow } from '../cart-line-rows';
import { useCartLineAutosave } from '../use-cart-line-autosave';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	// Text, as Woo spells a fee and as Add fee holds it: the amount field hands a text form text.
	amount: z.string().optional(),
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
	const { getFeeLineData } = useFeeLineData();
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
		getFeeLineData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(
			formSchema.extend({ amount: feeAmountSchema(t('pos_cart.fee_amount_negative')) }) as never
		) as never,
		defaultValues: {
			name: item.name ?? undefined,
			amount: String(amount),
			percent,
			tax_status: item.tax_status ?? 'taxable',
			tax_class: taxClassFromWire(item.tax_class),
			prices_include_tax,
			percent_of_cart_total_with_tax,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	useCartLineAutosave('fee_lines', uuid, form);

	/**
	 * Watch for changes to `percent`
	 */
	const togglePercentage = useWatch({ control: form.control, name: 'percent' });

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList prefix="fee-line">
					<PropertyRow id="name" label={t('pos_cart.fee_name')}>
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
					</PropertyRow>
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
					<PropertyRow
						id="includes-tax"
						label={t('pos_cart.amount_includes_tax')}
						name="prices_include_tax"
						control={
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
