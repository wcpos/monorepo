import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormRadioGroup, FormSelect } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

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
	item: NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
}

/**
 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
 */
export function EditLineItemForm({ uuid, item }: Props) {
	const t = useT();
	const { updateLineItem } = useUpdateLineItem();
	const { onOpenChange } = useRootContext();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price, tax_status } = getLineItemData(item);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			price: toNumber(price),
			regular_price: toNumber(regular_price),
			tax_status,
			tax_class: item.tax_class === '' ? 'standard' : item.tax_class,
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	/**
	 *
	 */
	const handleSave = React.useCallback(
		(data: FormValues) => {
			updateLineItem(uuid, {
				name: data.name,
				sku: data.sku,
				quantity: data.quantity,
				price: data.price,
				regular_price: data.regular_price,
				tax_status: data.tax_status,
				tax_class: data.tax_class === 'standard' ? '' : data.tax_class,
				meta_data: data.meta_data as never,
			});
			onOpenChange(false);
		},
		[updateLineItem, uuid, onOpenChange]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSave);

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
					render={({ field }) => <FormInput label={t('common.name')} {...field} />}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('common.sku')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="quantity"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									customComponent={NumberInput}
									label={t('pos_cart.quantity')}
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="price"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('common.price')}
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('common.regular_price')}
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
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
				<MetaDataForm withDisplayValues />
				<DialogFooter className="px-0">
					<DialogClose>{t('common.close')}</DialogClose>
					<DialogAction onPress={onSave}>{t('common.save')}</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
}
