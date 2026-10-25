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
	FormItem,
	FormLabel,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	FormTreeCombobox,
	SavedFieldProvider,
	SavedMark,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogClose, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord, ProductPayload } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

import { useT } from '../../../../../contexts/translations';
import { useAppInfo } from '../../../../../hooks/use-app-info';
import { CurrencyInput } from '../../../components/currency-input';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import { NumberInput } from '../../../components/number-input';
import { ProductStatusSelect } from '../../../components/product/status-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../components/tax-status-radio-group';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { DeleteProductDialog, RecordFooterActions, useProductActions } from '../../product-actions';
import { taxClassFromWire } from '../../../hooks/tax-class';
import { useCatalogueAutosave } from '../use-catalogue-autosave';

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

type FormValues = z.infer<typeof schema>;

interface Props {
	product: EngineRecord<'products'>;
}

/** The form's values for a payload: at open, and again when Sync lands the store's copy. */
function formValues(productData: ProductPayload): z.infer<typeof schema> {
	return {
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
	} as z.infer<typeof schema>;
}

/**
 *
 */
export function EditProductForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditProductFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditProductFormFields({ product }: Props) {
	const t = useT();
	const { close } = useDialog();
	const [categoryOptions, setCategoryOptions] = React.useState<HierarchicalOption[]>([]);
	// The modal route sits outside the list's ProAccessProvider, so it reads the licence itself.
	const readOnly = !(useAppInfo().license?.isPro ?? false);

	if (!product) {
		throw new Error(t('products.product_not_found'));
	}
	const form = useForm<FormValues>({
		resolver: zodResolver(schema as never) as never,
		defaultValues: formValues(product.toMutableJSON().payload),
	});
	const { flush } = useCatalogueAutosave({
		record: product,
		form,
		readOnly,
		wire: (root, value) =>
			root === 'categories'
				? form.getValues('categories').map((opt) => ({ id: toNumber(opt.value), name: opt.label }))
				: value,
	});
	// Sync flushes the pending edit first, then takes the store's copy; resetting the draft
	// prevents a debounced write from putting stale values back over the pulled ones.
	const actions = useProductActions(product, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () => form.reset(formValues(product.getLatest().payload as ProductPayload)),
	});
	// The record's actions on the left, Close on the right.
	const leading = !readOnly && (actions.canDelete || actions.canSync);

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
								<FormLabel>{t('common.name')}</FormLabel>
								<SavedMark name="name" label={t('settings.saved')} />
							</HStack>
							<FormInput testID="product-edit-name-input" {...field} />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="categories"
					render={({ field }) => (
						<FormItem>
							<HStack className="justify-between">
								<FormLabel>{t('common.categories')}</FormLabel>
								<SavedMark name="categories" label={t('settings.saved')} />
							</HStack>
							<FormTreeCombobox
								options={categoryOptions}
								cascadeSelection={false}
								placeholder={t('common.select_category')}
								searchPlaceholder={t('common.search_categories')}
								emptyMessage={t('common.no_category_found')}
								{...field}
							>
								<CategoryTreeLoader onOptionsLoaded={setCategoryOptions} />
							</FormTreeCombobox>
						</FormItem>
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="sku"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.sku')}</FormLabel>
									<SavedMark name="sku" label={t('settings.saved')} />
								</HStack>
								<FormInput {...field} />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="barcode"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.barcode')}</FormLabel>
									<SavedMark name="barcode" label={t('settings.saved')} />
								</HStack>
								<FormInput {...field} />
							</FormItem>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.regular_price')}</FormLabel>
									<SavedMark name="regular_price" label={t('settings.saved')} />
								</HStack>
								<FormInput customComponent={CurrencyInput} {...field} />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="sale_price"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.sale_price')}</FormLabel>
									<SavedMark name="sale_price" label={t('settings.saved')} />
								</HStack>
								<FormInput customComponent={CurrencyInput} {...field} />
							</FormItem>
						)}
					/>
				</HStack>
				<HStack className="items-start gap-4">
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="status"
							render={({ field: { value, onChange, ...rest } }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('common.status')}</FormLabel>
										<SavedMark name="status" label={t('settings.saved')} />
									</HStack>
									<FormSelect
										customComponent={ProductStatusSelect}
										value={value as string}
										onChange={onChange}
										{...rest}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="featured"
							render={({ field }) => (
								<HStack className="items-center justify-between">
									<View className="flex-1">
										<FormSwitch label={t('common.featured')} {...field} />
									</View>
									<SavedMark name="featured" label={t('settings.saved')} />
								</HStack>
							)}
						/>
						<FormField
							control={form.control}
							name="virtual"
							render={({ field }) => (
								<HStack className="items-center justify-between">
									<View className="flex-1">
										<FormSwitch label={t('products.virtual')} {...field} />
									</View>
									<SavedMark name="virtual" label={t('settings.saved')} />
								</HStack>
							)}
						/>
						<FormField
							control={form.control}
							name="downloadable"
							render={({ field }) => (
								<HStack className="items-center justify-between">
									<View className="flex-1">
										<FormSwitch label={t('products.downloadable')} {...field} />
									</View>
									<SavedMark name="downloadable" label={t('settings.saved')} />
								</HStack>
							)}
						/>
					</VStack>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field: { value, ...rest } }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('products.stock_quantity')}</FormLabel>
										<SavedMark name="stock_quantity" label={t('settings.saved')} />
									</HStack>
									<FormInput
										customComponent={NumberInput}
										type="numeric"
										value={value != null ? String(value) : undefined}
										{...rest}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => (
								<HStack className="items-center justify-between">
									<View className="flex-1">
										<FormSwitch label={t('products.manage_stock')} {...field} />
									</View>
									<SavedMark name="manage_stock" label={t('settings.saved')} />
								</HStack>
							)}
						/>
					</VStack>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.tax_class')}</FormLabel>
									<SavedMark name="tax_class" label={t('settings.saved')} />
								</HStack>
								<FormSelect
									customComponent={TaxClassSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_status"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.tax_status')}</FormLabel>
									<SavedMark name="tax_status" label={t('settings.saved')} />
								</HStack>
								<FormRadioGroup customComponent={TaxStatusRadioGroup} {...field} />
							</FormItem>
						)}
					/>
				</HStack>
				<View className="relative">
					<MetaDataForm />
					{/* Out of flow, beside the component's own heading: the mark never moves the rows. */}
					<View className="pointer-events-none absolute top-0 right-0">
						<SavedMark name="meta_data" label={t('settings.saved')} />
					</View>
				</View>
			</DialogBody>
			<DialogFooter className={leading ? 'flex-wrap justify-between' : undefined}>
				{leading && <RecordFooterActions actions={actions} testIDPrefix="product" />}
				<DialogClose testID="product-edit-close-button">{t('common.close')}</DialogClose>
			</DialogFooter>
			{!readOnly && actions.canDelete && (
				<DeleteProductDialog
					record={product}
					open={actions.deleteOpen}
					onOpenChange={actions.setDeleteOpen}
					onConfirm={() => void actions.confirmDelete()}
				/>
			)}
		</Form>
	);
}
