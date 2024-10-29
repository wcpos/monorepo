import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	DialogAction,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormSwitch,
	FormRadioGroup,
	FormSelect,
	FormInput,
} from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

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
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['fee_lines'][number];
}

/**
 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
 */
export const EditFeeLineForm = ({ uuid, item }: Props) => {
	const t = useT();
	const { updateFeeLine } = useUpdateFeeLine();
	const { onOpenChange } = useRootContext();
	const { getFeeLineData } = useFeeLineData();
	const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
		getFeeLineData(item);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: item.name,
			amount: toNumber(amount),
			percent,
			tax_status: item.tax_status,
			tax_class: item.tax_class === '' ? 'standard' : item.tax_class,
			prices_include_tax,
			percent_of_cart_total_with_tax,
			meta_data: item.meta_data,
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
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
						<FormInput
							label={t('Fee Name', { _tags: 'core' })}
							placeholder={t('Fee', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<FormInput
								customComponent={togglePercentage ? NumberInput : CurrencyInput}
								label={
									togglePercentage
										? t('Percent', { _tags: 'core' })
										: t('Amount', { _tags: 'core' })
								}
								type="numeric"
								{...field}
							/>
						)}
					/>
					<VStack className="justify-center">
						<FormField
							control={form.control}
							name="percent"
							render={({ field }) => (
								<FormSwitch label={t('Percentage of Cart Total', { _tags: 'core' })} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormSwitch label={t('Amount Includes Tax', { _tags: 'core' })} {...field} />
							)}
						/>
					</VStack>
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field }) => (
							<FormSelect
								label={t('Tax Class', { _tags: 'core' })}
								customComponent={TaxClassSelect}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field }) => (
							<FormRadioGroup
								label={t('Tax Status', { _tags: 'core' })}
								customComponent={TaxStatusRadioGroup}
								{...field}
							/>
						)}
					/>
				</View>
				<MetaDataForm />
				<DialogFooter className="px-0">
					<DialogClose>{t('Close', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={form.handleSubmit(handleSave)}>
						{t('Save', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
