import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import { DialogClose, useRootContext } from '@wcpos/components/src/dialog';
import { Form, FormField, FormInput, FormRadioGroup, FormSelect } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
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
	sku: z.string().optional(),
	price: z.string().optional(),
	regular_price: z.string().optional(),
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
			sku: item.sku,
			price,
			regular_price,
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
			const { sku, price, regular_price, tax_status, tax_class, meta_data } = data;
			updateLineItem(uuid, {
				sku,
				price,
				regular_price,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				meta_data,
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
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="price"
						render={({ field }) => (
							<FormInput
								customComponent={NumberInput}
								label={t('Price', { _tags: 'core' })}
								placeholder="0"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field }) => (
							<FormInput
								customComponent={NumberInput}
								label={t('Regular Price', { _tags: 'core' })}
								placeholder="0"
								{...field}
							/>
						)}
					/>
					<View className="col-span-2">
						<FormField
							control={form.control}
							name="sku"
							render={({ field }) => <FormInput label={t('SKU', { _tags: 'core' })} {...field} />}
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
				<MetaDataForm withDisplayValues />
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
