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
	FormRadioGroup,
	FormSelect,
	FormSwitch,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalAction, ModalClose, ModalFooter } from '@wcpos/components/modal';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import { CurrencyInput } from '../../../components/currency-input';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import { NumberInput } from '../../../components/number-input';
import { ProductStatusSelect } from '../../../components/product/status-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../components/tax-status-radio-group';
import usePushDocument from '../../../contexts/use-push-document';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';

const mutationLogger = getLogger(['wcpos', 'mutations', 'product']);

const schema = z.object({
	name: z.string(),
	regular_price: z.string(),
	sale_price: z.string(),
	stock_quantity: z.number().optional().nullable(),
	manage_stock: z.boolean().optional(),
	status: z.string(),
	featured: z.boolean(),
	sku: z.string().optional(),
	barcode: z.string().optional(),
	tax_status: z.string(),
	tax_class: z.string(),
	meta_data: metaDataSchema,
});

interface Props {
	product: import('@wcpos/database').ProductDocument;
}

/**
 *
 */
export const EditProductForm = ({ product }: Props) => {
	const pushDocument = usePushDocument();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();

	if (!product) {
		throw new Error(t('Product not found'));
	}

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: product.name,
			status: product.status,
			featured: product.featured,
			sku: product.sku,
			regular_price: product.regular_price,
			sale_price: product.sale_price,
			stock_quantity: product.stock_quantity,
			manage_stock: product.manage_stock,
			barcode: product.barcode,
			tax_status: product.tax_status,
			tax_class: product.tax_class === '' ? 'standard' : product.tax_class,
			meta_data: product.meta_data,
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
					document: product,
					data,
				});
				await pushDocument(product).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						mutationLogger.success(t('{name} saved', {name: product.name }), {
							showToast: true,
							saveToDb: true,
							context: {
								productId: savedDoc.id,
								productName: product.name,
							},
						});
					}
				});
			} catch (error) {
				mutationLogger.error(t('{message}', {message: error.message || 'Error' }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						productId: product.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, product, pushDocument, t]
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
					render={({ field }) => <FormInput label={t('Name')} {...field} />}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('SKU')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="barcode"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Barcode')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('Regular Price')}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="sale_price"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('Sale Price')}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="status"
							render={({ field }) => (
								<View className="flex-1">
									<FormSelect
										label={t('Status')}
										customComponent={ProductStatusSelect}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="featured"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('Featured')} {...field} />
								</View>
							)}
						/>
					</VStack>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput
										customComponent={NumberInput}
										type="numeric"
										label={t('Stock Quantity')}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('Manage Stock')} {...field} />
								</View>
							)}
						/>
					</VStack>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									label={t('Tax Class')}
									customComponent={TaxClassSelect}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('Tax Status')}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<ModalFooter className="px-0">
					<ModalClose>{t('Cancel')}</ModalClose>
					<ModalAction loading={loading} onPress={onSave}>
						{t('Save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
