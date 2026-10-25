import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
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
	SavedFieldProvider,
	SavedMark,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogClose, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord, VariationPayload } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useAppInfo } from '../../../../../hooks/use-app-info';
import { CurrencyInput } from '../../../components/currency-input';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import { NumberInput } from '../../../components/number-input';
import { ProductStatusSelect } from '../../../components/product/status-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../components/tax-status-radio-group';
import {
	DeleteVariationDialog,
	RecordFooterActions,
	useVariationActions,
} from '../../product-actions';
import { taxClassFromWire } from '../../../hooks/tax-class';
import { useCatalogueAutosave } from '../use-catalogue-autosave';

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

type FormValues = z.infer<typeof schema>;

interface Props {
	variation: EngineRecord<'variations'>;
}

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

function EditVariationFormFields({ variation }: Props) {
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
	// Sync flushes the pending edit first, then takes the store's copy; resetting the draft
	// prevents a debounced write from putting stale values back over the pulled ones.
	const actions = useVariationActions(variation, {
		onDeleted: close,
		beforeSync: flush,
		onSynced: () => form.reset(formValues(variation.getLatest().payload as VariationPayload)),
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
				<HStack className="gap-4">
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
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
						)}
					/>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field: { value, ...rest } }) => (
								<FormItem>
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
				{leading && <RecordFooterActions actions={actions} testIDPrefix="variation" />}
				<DialogClose testID="variation-edit-close-button">{t('common.close')}</DialogClose>
			</DialogFooter>
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
