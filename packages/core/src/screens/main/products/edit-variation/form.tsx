import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSelect,
	FormSwitch,
	FormRadioGroup,
} from '@wcpos/components/src/form';
import { ModalAction, ModalClose, ModalFooter } from '@wcpos/components/src/modal';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { NumberInput } from '../../components/number-input';
import { ProductStatusSelect } from '../../components/product/status-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import usePushDocument from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const schema = z.object({
	regular_price: z.string(),
	sale_price: z.string(),
	stock_quantity: z.number().optional().nullable(),
	manage_stock: z.boolean().optional(),
	status: z.string(),
	sku: z.string().optional(),
	barcode: z.string().optional(),
	tax_status: z.string(),
	tax_class: z.string(),
	meta_data: metaDataSchema,
});

interface Props {
	variation: import('@wcpos/database').ProductVariationDocument;
}

/**
 *
 */
export const EditVariationForm = ({ variation }: Props) => {
	const pushDocument = usePushDocument();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();

	if (!variation) {
		throw new Error(t('Variation not found'));
	}

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			status: variation.status,
			sku: variation.sku,
			regular_price: variation.regular_price,
			sale_price: variation.sale_price,
			stock_quantity: variation.stock_quantity,
			manage_stock: variation.manage_stock,
			barcode: variation.barcode,
			tax_status: variation.tax_status,
			tax_class: variation.tax_class === '' ? 'standard' : variation.tax_class,
			meta_data: variation.meta_data,
		},
	});

	/**
	 * Handle save button click
	 *
	 * @NOTE - the form needs a value for tax_class, but WC REST API uses an empty string for standard
	 */
	const handleSave = React.useCallback(
		async (data) => {
			if (data.tax_class === 'standard') {
				data.tax_class = '';
			}
			setLoading(true);
			try {
				await localPatch({
					document: variation,
					data,
				});
				await pushDocument(variation).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						Toast.show({
							type: 'success',
							text1: t('{name} saved', { name: variation.name }),
						});
					}
				});
			} catch (error) {
				Toast.show({
					type: 'error',
					text1: t('{message}', { message: error.message || 'Error' }),
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, variation, pushDocument, t]
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
						name="sku"
						render={({ field }) => <FormInput label={t('SKU')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="barcode"
						render={({ field }) => <FormInput label={t('Barcode')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field }) => (
							<FormInput
								customComponent={CurrencyInput}
								label={t('Regular Price')}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="sale_price"
						render={({ field }) => (
							<FormInput
								customComponent={CurrencyInput}
								label={t('Sale Price')}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="status"
						render={({ field }) => (
							<FormSelect
								label={t('Status')}
								customComponent={ProductStatusSelect}
								{...field}
							/>
						)}
					/>
					<VStack>
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field }) => (
								<FormInput
									customComponent={NumberInput}
									type="numeric"
									label={t('Stock Quantity')}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => (
								<FormSwitch label={t('Manage Stock')} {...field} />
							)}
						/>
					</VStack>
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field }) => (
							<FormSelect
								label={t('Tax Class')}
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
								label={t('Tax Status')}
								customComponent={TaxStatusRadioGroup}
								{...field}
							/>
						)}
					/>
					<View className="col-span-2">
						<MetaDataForm />
					</View>
				</View>
				<ModalFooter className="px-0">
					<ModalClose>{t('Cancel')}</ModalClose>
					<ModalAction loading={loading} onPress={form.handleSubmit(handleSave)}>
						{t('Save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
