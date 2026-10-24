import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput } from '../../../../components/number-input';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { taxClassFromWire, taxClassToWire } from '../../../../hooks/tax-class';
import { useFeeLineData } from '../../../hooks/use-fee-line-data';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useUpdateCartLine } from '../../../hooks/use-update-cart-line';

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

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<HStack className="justify-between">
								<FormLabel>{t('pos_cart.fee_name')}</FormLabel>
								<SavedMark name="name" label={t('settings.saved')} />
							</HStack>
							<FormInput
								testID="edit-fee-line-name-input"
								placeholder={t('pos_cart.fee')}
								{...field}
							/>
						</FormItem>
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>
										{togglePercentage ? t('pos_cart.percent') : t('pos_cart.amount')}
									</FormLabel>
									<SavedMark name="amount" label={t('settings.saved')} />
								</HStack>
								<FormInput
									customComponent={togglePercentage ? NumberInput : CurrencyInput}
									testID="edit-fee-line-amount-input"
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
						)}
					/>
					<VStack className="flex-1 justify-center">
						<FormField
							control={form.control}
							name="percent"
							render={({ field }) => (
								<FormSwitch label={t('pos_cart.percentage_of_cart_total')} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormSwitch label={t('pos_cart.amount_includes_tax')} {...field} />
							)}
						/>
					</VStack>
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
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('common.tax_status')}
									customComponent={TaxStatusRadioGroup}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.close')}</DialogClose>
			</DialogFooter>
		</Form>
	);
}
