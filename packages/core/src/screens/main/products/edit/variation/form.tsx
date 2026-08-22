import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
import { ModalAction, ModalClose, ModalFooter, useModal } from '@wcpos/components/modal';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';
import { CurrencyInput } from '../../../components/currency-input';
import { FormErrors } from '../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../components/meta-data-form';
import { NumberInput } from '../../../components/number-input';
import { ProductStatusSelect } from '../../../components/product/status-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../components/tax-status-radio-group';
import { refreshVariationParent } from '../../../hooks/mutations/refresh-variation-parent';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { taxClassFromWire, taxClassToWire } from '../../../hooks/tax-class';

const mutationLogger = getLogger(['wcpos', 'mutations', 'variation']);

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
	variation: EngineRecord<'variations'>;
}

/**
 *
 */
export function EditVariationForm({ variation }: Props) {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const runtime = useQueryRuntime();
	const { close } = useModal();
	const variationData = variation.toMutableJSON().payload;

	if (!variation) {
		throw new Error('Variation not found');
	}

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema as never) as never,
		defaultValues: {
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
		},
	});

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof schema>) => {
			data.tax_class = taxClassToWire(data.tax_class);
			setLoading(true);
			try {
				const patched = await localPatch({
					document: variation,
					data: data as Partial<import('@wcpos/database').ProductVariationDocument>,
				});
				// localPatch swallows write errors and resolves undefined.
				if (!patched?.document) {
					throw new Error('Local patch failed');
				}
				if (patched.mutationId) {
					// The parent's price range is recomputed from its children on every
					// read, so a price edit here leaves the products grid rendering the
					// old range until the parent is fetched again.
					void refreshVariationParent(runtime.engine, {
						document: variation,
						changes: patched.changes,
						mutationId: patched.mutationId,
					});
				}
				const saved = variation.getLatest().payload;
				mutationLogger.success(t('common.saved', { name: saved.name }), {
					showToast: true,
					context: {
						variationId: saved.id,
						variationName: saved.name,
					},
				});
				close();
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Failed to save product variation', {
					showToast: true,
					code: ERROR_CODES.PRODUCT_UNEXPECTED,
					toast: { title: t('products.failed_to_save_variation') },
					context: {
						variationId: variation.getLatest().payload.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[close, localPatch, runtime, variation, t]
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
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="status"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									label={t('common.status')}
									customComponent={ProductStatusSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field: { value, ...rest } }) => (
								<FormInput
									customComponent={NumberInput}
									type="numeric"
									label={t('products.stock_quantity')}
									value={value != null ? String(value) : undefined}
									{...rest}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => <FormSwitch label={t('products.manage_stock')} {...field} />}
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
					<ModalClose>{t('common.cancel')}</ModalClose>
					<ModalAction testID="variation-edit-save-button" loading={loading} onPress={onSave}>
						{t('common.save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
}
