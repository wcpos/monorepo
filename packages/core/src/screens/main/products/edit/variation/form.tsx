import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, SavedFieldProvider } from '@wcpos/components/form';
import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { PropertyAddRow, PropertyList } from '@wcpos/components/property-row';
import type { EngineRecord, VariationPayload } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useAppInfo } from '../../../../../hooks/use-app-info';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import {
	CatalogueKind,
	CustomFieldAdd,
	PriceRow,
	StatusRow,
	StockRow,
	TaxRow,
	useOfferedRows,
} from '../../../components/product/catalogue-rows';
import { DeleteVariationDialog, useVariationActions } from '../../product-actions';
import { taxClassFromWire } from '../../../hooks/tax-class';
import { useCatalogueAutosave } from '../use-catalogue-autosave';

const schema = z.object({
	regular_price: z.string(),
	sale_price: z.string(),
	stock_quantity: z.number().int().optional().nullable(),
	manage_stock: z.boolean().optional(),
	status: z.string(),
	sku: z.string().optional(),
	barcode: z.string().optional(),
	tax_status: z.string(),
	tax_class: z.string(),
	meta_data: metaDataSchema,
});

type FormValues = z.infer<typeof schema>;

interface Props {
	variation: EngineRecord<'variations'>;
	/** The parent product's tax class, for a variation that follows it ("Same as parent"). */
	parentClass?: string;
}

/** The variation's offered facts in canonical order; Custom field follows. */
const OFFERED = ['sale_price', 'sku', 'barcode'] as const;

/** The form's values for a payload: at open, and again when Sync lands the store's copy. */
function formValues(variationData: VariationPayload): z.infer<typeof schema> {
	return {
		status: variationData.status,
		sku: variationData.sku,
		regular_price: variationData.regular_price,
		sale_price: variationData.sale_price,
		stock_quantity: variationData.stock_quantity,
		manage_stock: variationData.manage_stock,
		barcode: variationData.barcode,
		tax_status: variationData.tax_status,
		tax_class: taxClassFromWire(variationData.tax_class),
		meta_data: variationData.meta_data,
	} as z.infer<typeof schema>;
}

/**
 *
 */
export function EditVariationForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditVariationFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditVariationFormFields({ variation, parentClass }: Props) {
	const t = useT();
	const { close } = useDialog();
	// The modal route sits outside the list's ProAccessProvider, so it reads the licence itself.
	const readOnly = !(useAppInfo().license?.isPro ?? false);

	if (!variation) {
		throw new Error('Variation not found');
	}
	const form = useForm<FormValues>({
		resolver: zodResolver(schema as never) as never,
		defaultValues: formValues(variation.toMutableJSON().payload),
	});
	const { flush } = useCatalogueAutosave({
		record: variation,
		form,
		readOnly,
	});
	const offered = useOfferedRows(form, 'variation', OFFERED);
	// Sync flushes the pending edit first, then takes the store's copy; resetting the draft
	// prevents a debounced write from putting stale values back over the pulled ones.
	const actions = useVariationActions(variation, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () => form.reset(formValues(variation.getLatest().payload as VariationPayload)),
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<CatalogueKind.Provider value="variation">
					<PropertyList testID="variation-form">
						<PriceRow name="regular_price" label={t('common.regular_price')} />
						{offered.row('sale_price')}
						{offered.row('sku')}
						{offered.row('barcode')}
						<StockRow />
						<TaxRow includeParent parentClass={parentClass} />
						<StatusRow />
						<MetaDataForm testID="variation" />
						<PropertyAddRow>
							{offered.adds}
							<CustomFieldAdd />
						</PropertyAddRow>
					</PropertyList>
				</CatalogueKind.Provider>
			</DialogBody>
			<DialogFooter
				destructive={
					!readOnly && actions.canDelete
						? {
								label: t('common.delete'),
								testID: 'variation-modal-delete',
								onPress: actions.requestDelete,
							}
						: undefined
				}
				record={
					!readOnly && actions.canSync
						? { label: t('common.sync'), testID: 'variation-modal-sync', onPress: actions.sync }
						: undefined
				}
				close={{ testID: 'variation-edit-close-button' }}
			/>
			{!readOnly && actions.canDelete && (
				<DeleteVariationDialog
					record={variation}
					open={actions.deleteOpen}
					onOpenChange={actions.setDeleteOpen}
					onConfirm={() => void actions.confirmDelete()}
				/>
			)}
		</Form>
	);
}
