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
import { Form, FormField, FormInput, FormRadioGroup, FormSelect } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput } from '../../../../components/number-input';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { useLineItemData } from '../../../hooks/use-line-item-data';
import { useUpdateLineItem } from '../../../hooks/use-update-line-item';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	sku: z.string().optional(),
	quantity: z.number().optional(),
	price: z.number().optional(),
	regular_price: z.number().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	meta_data: metaDataSchema,
});

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['line_items'][number];
}

/**
 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
 */
export const EditLineItemForm = ({ uuid, item }: Props) => {
	const t = useT();
	const { updateLineItem } = useUpdateLineItem();
	const { onOpenChange } = useRootContext();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price, tax_status } = getLineItemData(item);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			price: toNumber(price),
			regular_price: toNumber(regular_price),
			tax_status,
			tax_class: item.tax_class === '' ? 'standard' : item.tax_class,
			meta_data: item.meta_data,
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
			updateLineItem(uuid, {
				name: data.name,
				sku: data.sku,
				quantity: data.quantity,
				price: String(data.price),
				regular_price: String(data.regular_price),
				tax_status: data.tax_status,
				tax_class: data.tax_class === 'standard' ? '' : data.tax_class,
				meta_data: data.meta_data,
			});
			onOpenChange(false);
		},
		[updateLineItem, uuid, onOpenChange]
	);

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
					render={({ field }) => <FormInput label={t('Name', { _tags: 'core' })} {...field} />}
				/>
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => <FormInput label={t('SKU', { _tags: 'core' })} {...field} />}
					/>
					<FormField
						control={form.control}
						name="quantity"
						render={({ field }) => (
							<FormInput
								customComponent={NumberInput}
								label={t('Quantity', { _tags: 'core' })}
								type="numeric"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="price"
						render={({ field }) => (
							<FormInput
								customComponent={CurrencyInput}
								label={t('Price', { _tags: 'core' })}
								type="numeric"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field }) => (
							<FormInput
								customComponent={CurrencyInput}
								label={t('Regular Price', { _tags: 'core' })}
								type="numeric"
								{...field}
							/>
						)}
					/>
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
				<MetaDataForm withDisplayValues />
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
