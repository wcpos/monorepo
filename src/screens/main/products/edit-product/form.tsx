import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { StackActions, useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Form, FormField, FormInput, FormSelect, FormSwitch } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { Toast } from '@wcpos/tailwind/src/toast';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { ProductStatusSelect } from '../../components/product/status-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import usePushDocument from '../../contexts/use-push-document';

const schema = z.object({
	name: z.string(),
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
	const navigation = useNavigation();

	if (!product) {
		throw new Error(t('Product not found', { _tags: 'core' }));
	}

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(
		async (data) => {
			console.log('data', data);
			try {
				// const success = await pushDocument(product);
				// if (isRxDocument(success)) {
				// 	Toast.show({
				// 		text1: t('Product {id} saved', { _tags: 'core', id: success.id }),
				// 		type: 'success',
				// 	});
				// }
			} catch (error) {
				log.error(error);
			} finally {
				//
			}
		},
		[product, pushDocument, t]
	);

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
			barcode: product.barcode,
			tax_status: product.tax_status,
			tax_class: product.tax_class,
			meta_data: product.meta_data,
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<View className="grid grid-cols-2 gap-4">
				<View className="col-span-2">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => <FormInput label={t('Name', { _tags: 'core' })} {...field} />}
					/>
				</View>
				<FormField
					control={form.control}
					name="status"
					render={({ field }) => (
						<FormSelect
							label={t('Status', { _tags: 'core' })}
							customComponent={ProductStatusSelect}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="featured"
					render={({ field }) => <FormSwitch label={t('Featured', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="sku"
					render={({ field }) => <FormInput label={t('SKU', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="barcode"
					render={({ field }) => <FormInput label={t('Barcode', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="tax_status"
					render={({ field }) => <TaxStatusRadioGroup form={form} field={field} />}
				/>
				<FormField
					control={form.control}
					name="tax_class"
					render={({ field }) => <TaxClassSelect field={field} />}
				/>
				<View className="col-span-2">
					<MetaDataForm />
				</View>
			</View>
			<HStack className="justify-end">
				<Button variant="secondary" onPress={() => navigation.dispatch(StackActions.pop(1))}>
					<ButtonText>{t('Cancel', { _tags: 'core' })}</ButtonText>
				</Button>
				<Button onPress={form.handleSubmit(handleSave)}>
					<ButtonText>{t('Save to Server', { _tags: 'core' })}</ButtonText>
				</Button>
			</HStack>
		</Form>
	);
};
