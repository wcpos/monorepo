import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormTreeCombobox, SavedFieldProvider } from '@wcpos/components/form';
import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { PropertyAddRow, PropertyList } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import type { EngineRecord, ProductPayload } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

import { useT } from '../../../../../contexts/translations';
import { useAppInfo } from '../../../../../hooks/use-app-info';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import {
	CatalogueRow,
	CustomFieldAdd,
	PriceRow,
	StatusRow,
	StockRow,
	TaxRow,
	TextRow,
	useOfferedRows,
} from '../../../components/product/catalogue-rows';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { DeleteProductDialog, useProductActions } from '../../product-actions';
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

/** The product's offered facts in canonical order; Custom field follows. */
const OFFERED = ['sale_price', 'barcode', 'featured', 'virtual', 'downloadable'] as const;

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
	const offered = useOfferedRows(form, 'product', OFFERED);
	// Sync flushes the pending edit first, then takes the store's copy; resetting the draft
	// prevents a debounced write from putting stale values back over the pulled ones.
	const actions = useProductActions(product, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () => form.reset(formValues(product.getLatest().payload as ProductPayload)),
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList testID="product-form">
					<TextRow name="name" label={t('common.name')} testID="product-edit-name-input" />
					<PriceRow name="regular_price" label={t('common.regular_price')} />
					{offered.row('sale_price')}
					<TextRow name="sku" label={t('common.sku')} />
					{offered.row('barcode')}
					<StockRow />
					<TaxRow />
					<CatalogueRow id="categories" label={t('common.categories')} align="top">
						<FormField
							control={form.control}
							name="categories"
							render={({ field }) => (
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
							)}
						/>
					</CatalogueRow>
					<StatusRow />
					{product.payload.type === 'variable' && (
						// Set elsewhere is locked (rule 6): the variations are edited under the product's row.
						<CatalogueRow
							id="variations"
							label={t('common.variations')}
							verb={
								<Text className="text-muted-foreground text-sm">
									{t('products.managed_in_the_list')}
								</Text>
							}
						>
							<Text>
								{t('products.n_variations', { count: product.payload.variations?.length ?? 0 })}
							</Text>
						</CatalogueRow>
					)}
					{offered.row('featured')}
					{offered.row('virtual')}
					{offered.row('downloadable')}
					<MetaDataForm testID="product" />
					<PropertyAddRow>
						{offered.adds}
						<CustomFieldAdd />
					</PropertyAddRow>
				</PropertyList>
			</DialogBody>
			<DialogFooter
				destructive={
					!readOnly && actions.canDelete
						? {
								label: t('common.delete'),
								testID: 'product-modal-delete',
								onPress: actions.requestDelete,
							}
						: undefined
				}
				record={
					!readOnly && actions.canSync
						? { label: t('common.sync'), testID: 'product-modal-sync', onPress: actions.sync }
						: undefined
				}
				close={{ testID: 'product-edit-close-button' }}
			/>
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
