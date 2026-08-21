import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	FormTreeCombobox,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalAction, ModalClose, ModalFooter, useModal } from '@wcpos/components/modal';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

import { useT } from '../../../../../contexts/translations';
import { CurrencyInput } from '../../../components/currency-input';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import { NumberInput } from '../../../components/number-input';
import { ProductStatusSelect } from '../../../components/product/status-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../components/tax-status-radio-group';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { taxClassFromWire, taxClassToWire } from '../../../hooks/tax-class';

const mutationLogger = getLogger(['wcpos', 'mutations', 'product']);

const categoryOptionSchema = z.object({ value: z.string(), label: z.string() });

const schema = z.object({
	name: z.string(),
	categories: z.array(categoryOptionSchema).default([]),
	regular_price: z.string(),
	sale_price: z.string(),
	stock_quantity: z.number().optional().nullable(),
	manage_stock: z.boolean().optional(),
	status: z.string(),
	featured: z.boolean(),
	virtual: z.boolean(),
	downloadable: z.boolean(),
	sku: z.string().optional(),
	barcode: z.string().optional(),
	tax_status: z.string(),
	tax_class: z.string(),
	meta_data: metaDataSchema,
});

interface Props {
	product: EngineRecord<'products'>;
}

/**
 *
 */
export function EditProductForm({ product }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const { close } = useModal();
	const [categoryOptions, setCategoryOptions] = React.useState<HierarchicalOption[]>([]);
	const productData = product.toMutableJSON().payload;

	if (!product) {
		throw new Error(t('products.product_not_found'));
	}

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema as never) as never,
		defaultValues: {
			name: productData.name,
			categories:
				productData.categories?.map((c) => ({
					value: String(c.id),
					label: c.name ?? '',
				})) ?? [],
			status: productData.status,
			featured: productData.featured,
			virtual: productData.virtual ?? false,
			downloadable: productData.downloadable ?? false,
			sku: productData.sku,
			regular_price: productData.regular_price,
			sale_price: productData.sale_price,
			stock_quantity: productData.stock_quantity,
			manage_stock: productData.manage_stock,
			barcode: productData.barcode,
			tax_status: productData.tax_status,
			tax_class: taxClassFromWire(productData.tax_class),
			meta_data: productData.meta_data,
		},
	});

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof schema>) => {
			data.tax_class = taxClassToWire(data.tax_class);
			const { categories: categoryOptions, ...rest } = data;
			const patchData: Partial<import('@wcpos/database').ProductDocument> = {
				...rest,
				categories: categoryOptions.map((opt) => ({
					id: toNumber(opt.value),
					name: opt.label,
				})),
			} as any;
			setLoading(true);
			try {
				const patched = await localPatch({
					document: product,
					data: patchData,
				});
				// localPatch swallows write errors and resolves undefined.
				if (!patched?.document) {
					throw new Error('Local patch failed');
				}
				const saved = product.getLatest().payload;
				mutationLogger.success(t('common.saved', { name: saved.name }), {
					showToast: true,
					context: {
						productId: saved.id,
						productName: saved.name,
					},
				});
				close();
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Failed to save product', {
					showToast: true,
					code: ERROR_CODES.PRODUCT_SAVE_FAILED,
					toast: { title: t('products.failed_to_save_product') },
					context: {
						productId: product.getLatest().payload.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[close, localPatch, product, t]
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
					render={({ field }) => (
						<FormInput testID="product-edit-name-input" label={t('common.name')} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="categories"
					render={({ field }) => (
						<FormTreeCombobox
							label={t('common.categories')}
							options={categoryOptions}
							cascadeSelection={false}
							placeholder={t('common.select_category')}
							searchPlaceholder={t('common.search_categories')}
							emptyMessage={t('common.no_category_found')}
							{...field}
						>
							<CategoryTreeLoader onOptionsLoaded={setCategoryOptions} />
						</FormTreeCombobox>
					)}
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
						name="barcode"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('common.barcode')} {...field} />
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
									label={t('common.regular_price')}
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
									label={t('common.sale_price')}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="items-start gap-4">
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="status"
							render={({ field: { value, onChange, ...rest } }) => (
								<View className="flex-1">
									<FormSelect
										label={t('common.status')}
										customComponent={ProductStatusSelect}
										value={value as string}
										onChange={onChange}
										{...rest}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="featured"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('common.featured')} {...field} />
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="virtual"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('products.virtual')} {...field} />
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="downloadable"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('products.downloadable')} {...field} />
								</View>
							)}
						/>
					</VStack>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field: { value, ...rest } }) => (
								<View className="flex-1">
									<FormInput
										customComponent={NumberInput}
										type="numeric"
										label={t('products.stock_quantity')}
										value={value != null ? String(value) : undefined}
										{...rest}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => (
								<View className="flex-1">
									<FormSwitch label={t('products.manage_stock')} {...field} />
								</View>
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
									value={value}
									onChange={onChange}
									{...rest}
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
									label={t('common.tax_status')}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<ModalFooter className="px-0">
					<ModalClose testID="product-edit-cancel-button">{t('common.cancel')}</ModalClose>
					<ModalAction testID="product-edit-save-button" loading={loading} onPress={onSave}>
						{t('common.save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
}
