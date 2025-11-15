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
import log from '@wcpos/utils/logger';
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
		throw new Error(t('Variation not found', { _tags: 'core' }));
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
					log.success(t('{name} saved', { _tags: 'core', name: variation.name }), {
						showToast: true,
						saveToDb: true,
						context: {
							variationId: savedDoc.id,
							variationName: variation.name,
						},
					});
				}
			});
		} catch (error) {
			log.error(t('{message}', { _tags: 'core', message: error.message || 'Error' }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					variationId: variation.id,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
				setLoading(false);
			}
		},
		[localPatch, variation, pushDocument, t]
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
								<FormInput label={t('SKU', { _tags: 'core' })} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="barcode"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Barcode', { _tags: 'core' })} {...field} />
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
									label={t('Regular Price', { _tags: 'core' })}
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
									label={t('Sale Price', { _tags: 'core' })}
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
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									label={t('Status', { _tags: 'core' })}
									customComponent={ProductStatusSelect}
									{...field}
								/>
							</View>
						)}
					/>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="stock_quantity"
							render={({ field }) => (
								<FormInput
									customComponent={NumberInput}
									type="numeric"
									label={t('Stock Quantity', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="manage_stock"
							render={({ field }) => (
								<FormSwitch label={t('Manage Stock', { _tags: 'core' })} {...field} />
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
									label={t('Tax Class', { _tags: 'core' })}
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
									label={t('Tax Status', { _tags: 'core' })}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
				<ModalFooter className="px-0">
					<ModalClose>{t('Cancel', { _tags: 'core' })}</ModalClose>
					<ModalAction loading={loading} onPress={onSave}>
						{t('Save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
