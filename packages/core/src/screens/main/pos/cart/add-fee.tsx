import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormItem, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { PropertyList, PropertyRow } from '@wcpos/components/property-row';

import { useT } from '../../../../contexts/translations';
import { AmountUnitToggle } from '../../components/amount-unit-toggle';
import { FormAmountField } from '../../components/amount-field';
import { FormErrors } from '../../components/form-errors';
import { TaxSelect } from '../../components/tax-select';
import { taxClassToWire } from '../../hooks/tax-class';
import { useAddFee } from '../hooks/use-add-fee';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	amount: z.string().optional(),
	percent: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

/**
 *
 */
export function AddFee() {
	const t = useT();
	const { addFee } = useAddFee();
	const { close: closeDialog } = useDialog();

	/**
	 *
	 */
	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(
			formSchema.extend({
				amount: z
					.string()
					.refine((value) => Number(value) >= 0, { message: t('pos_cart.fee_amount_negative') })
					.optional(),
			}) as never
		) as never,
		defaultValues: {
			name: '',
			amount: '0',
			prices_include_tax: true,
			tax_status: 'taxable',
			tax_class: 'standard',
			percent: false,
		},
	});

	const handleAdd = React.useCallback(
		async (data: FormValues) => {
			const { name, amount, percent, tax_status, tax_class, prices_include_tax } = data;
			await addFee({
				name: isEmpty(name) ? t('pos_cart.fee') : (name ?? ''),
				amount: amount ?? '0',
				tax_status,
				tax_class: taxClassToWire(tax_class),
				percent,
				prices_include_tax: prices_include_tax ?? true,
				meta_data: [],
			});
			closeDialog();
		},
		[addFee, closeDialog, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onAdd = form.handleSubmit(handleAdd);

	const [percent, taxStatus, taxClass] = useWatch({
		control: form.control,
		name: ['percent', 'tax_status', 'tax_class'],
	});

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList>
					<PropertyRow label={t('pos_cart.fee_name')} nativeID="fee-name-form-item">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem nativeID="fee-name">
									<FormInput placeholder={t('pos_cart.fee')} testID="fee-name-input" {...field} />
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow label={t('pos_cart.amount')} nativeID="fee-amount-form-item">
						<HStack className="gap-2">
							<FormField
								control={form.control}
								name="amount"
								render={({ field }) => (
									<FormItem nativeID="fee-amount" className="flex-1">
										<FormAmountField
											kind={percent ? 'percent' : 'money'}
											live
											testID="fee-amount-input"
											{...field}
										/>
									</FormItem>
								)}
							/>
							<AmountUnitToggle
								percent={percent}
								onChange={(next) => form.setValue('percent', next)}
								testID="fee-percent-switch"
								aria-labelledby="fee-amount-form-item"
							/>
						</HStack>
					</PropertyRow>
					<PropertyRow
						label={t('pos_cart.amount_includes_tax')}
						nativeID="fee-includes-tax-form-item"
						trailing={
							<FormField
								control={form.control}
								name="prices_include_tax"
								render={({ field }) => (
									<FormItem nativeID="fee-includes-tax">
										<FormSwitch testID="fee-includes-tax-switch" {...field} />
									</FormItem>
								)}
							/>
						}
					/>
					<PropertyRow label={t('common.tax')} nativeID="fee-tax-form-item">
						<TaxSelect
							status={taxStatus}
							taxClass={taxClass ?? 'standard'}
							onChange={(next) => {
								form.setValue('tax_status', next.tax_status);
								form.setValue('tax_class', next.tax_class);
							}}
							testID="fee-tax-select"
							aria-labelledby="fee-tax-form-item"
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
