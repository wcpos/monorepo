import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSelect } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useDialogContext } from './add-cart-item-button';
import { useT } from '../../../../contexts/translations';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddProduct } from '../hooks/use-add-product';

export interface MiscProductFormValues {
	name?: string;
	price?: string;
	sku?: string;
	tax_status?: string;
	tax_class?: string;
}

/**
 *
 */
export const AddMiscProduct = () => {
	const t = useT();
	const { buttonPressHandlerRef, setOpenDialog } = useDialogContext();
	const { addProduct } = useAddProduct();

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				name: z.string().optional(),
				price: z.string().optional(),
				sku: z.string().optional(),
				tax_status: z.string().optional(),
				tax_class: z.string().optional(),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
			price: '',
			sku: '',
			tax_status: 'taxable',
			tax_class: '',
		},
	});

	/**
	 *
	 */
	buttonPressHandlerRef.current = React.useCallback(() => {
		const { name, price, sku, tax_status, tax_class } = form.getValues();
		addProduct({
			id: 0,
			name: isEmpty(name) ? t('Product', { _tags: 'core' }) : name,
			price: isEmpty(price) ? '0' : price,
			sku,
			regular_price: isEmpty(price) ? '0' : price,
			tax_status: tax_status ? 'taxable' : 'none',
			tax_class,
		});
		setOpenDialog(false);
	}, [addProduct, form, setOpenDialog, t]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormInput
							label={t('Name', { _tags: 'core' })}
							placeholder={t('Product', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="sku"
					render={({ field }) => <FormInput label={t('SKU', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="price"
					render={({ field }) => (
						<FormInput label={t('Price', { _tags: 'core' })} placeholder="0" {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="tax_status"
					render={({ field }) => <TaxStatusRadioGroup form={form} field={field} />}
				/>
				<FormField
					control={form.control}
					name="tax_class"
					render={({ field }) => (
						<FormSelect
							customComponent={TaxClassSelect}
							label={t('Tax Class', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
			</VStack>
		</Form>
	);
};
