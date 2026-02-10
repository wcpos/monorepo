import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
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

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput } from '../../../../components/number-input';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useFeeLineData } from '../../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../../hooks/use-update-fee-line';

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
	item: NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
}

/**
 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
 */
export function EditFeeLineForm({ uuid, item }: Props) {
	const t = useT();
	const { updateFeeLine } = useUpdateFeeLine();
	const { onOpenChange } = useRootContext();
	const { getFeeLineData } = useFeeLineData();
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
		getFeeLineData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			name: item.name ?? undefined,
			amount: toNumber(amount),
			percent,
			tax_status: item.tax_status ?? 'taxable',
			tax_class: item.tax_class === '' ? 'standard' : item.tax_class,
			prices_include_tax,
			percent_of_cart_total_with_tax,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: FormValues) => {
			updateFeeLine(uuid, {
				name: data.name,
				amount: String(data.amount),
				tax_status: data.tax_status,
				tax_class: data.tax_class === 'standard' ? '' : data.tax_class,
				percent: data.percent,
				prices_include_tax: data.prices_include_tax,
				percent_of_cart_total_with_tax: data.percent_of_cart_total_with_tax,
			});
			onOpenChange(false);
		},
		[updateFeeLine, uuid, onOpenChange]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSave);

	/**
	 * Watch for changes to `percent`
	 */
	const togglePercentage = form.watch('percent');

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormInput label={t('pos_cart.fee_name')} placeholder={t('pos_cart.fee')} {...field} />
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									customComponent={togglePercentage ? NumberInput : CurrencyInput}
									label={togglePercentage ? t('pos_cart.percent') : t('pos_cart.amount')}
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
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
				<DialogFooter className="px-0">
					<DialogClose>{t('common.close')}</DialogClose>
					<DialogAction onPress={onSave}>{t('common.save')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
}
