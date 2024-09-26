import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { DialogClose, useRootContext } from '@wcpos/components/src/dialog';
import {
	Form,
	FormField,
	FormSwitch,
	FormRadioGroup,
	FormSelect,
	FormInput,
} from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { AmountWidget, amountWidgetSchema } from '../../../../components/amount-widget';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useFeeLineData } from '../../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../../hooks/use-update-fee-line';

/**
 *
 */
const formSchema = z.object({
	prices_include_tax: z.boolean().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	...amountWidgetSchema.shape,
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
			amount,
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
			const {
				amount,
				percent,
				tax_status,
				tax_class,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			} = data;
			updateFeeLine(uuid, {
				// total: isEmpty(total) ? '0' : total,
				amount,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				percent,
				prices_include_tax,
				percent_of_cart_total_with_tax,
			});
			onOpenChange(false);
		},
		[updateFeeLine, uuid, onOpenChange]
	);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="amount"
						render={({ field }) => (
							<FormInput
								customComponent={AmountWidget}
								label={t('Amount', { _tags: 'core' })}
								currencySymbol="$"
								{...field}
							/>
						)}
					/>
					<View className="justify-center">
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<FormSwitch label={t('Amount Includes Tax', { _tags: 'core' })} {...field} />
							)}
						/>
					</View>
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
				<HStack className="justify-end">
					<DialogClose asChild>
						<Button variant="muted">
							<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
						</Button>
					</DialogClose>
					<Button onPress={form.handleSubmit(handleSave)}>
						<ButtonText>{t('Save', { _tags: 'core' })}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
