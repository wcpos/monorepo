import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	DialogAction,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/src/dialog';
import { Form, FormField, FormInput, FormSelect, FormRadioGroup } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddProduct } from '../hooks/use-add-product';

const formSchema = z.object({
	name: z.string().optional(),
	price: z.string().default('0'),
	sku: z.string().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
});

/**
 *
 */
export const AddMiscProduct = () => {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { onOpenChange } = useRootContext();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: '',
			price: '0',
			sku: '',
			tax_status: 'taxable',
			tax_class: 'standard',
		},
	});

	/**
	 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
	 */
	const handleAdd = React.useCallback(
		(data: z.infer<typeof formSchema>) => {
			const { name, price, sku, tax_status, tax_class } = data;
			addProduct({
				id: 0,
				name: isEmpty(name) ? t('Product', { _tags: 'core' }) : name,
				price: isEmpty(price) ? '0' : price,
				sku,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status: tax_status ? 'taxable' : 'none',
				tax_class: tax_class === 'standard' ? '' : tax_class,
			});
			onOpenChange(false);
		},
		[addProduct, onOpenChange, t]
	);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
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
							<FormInput
								customComponent={CurrencyInput}
								label={t('Price', { _tags: 'core' })}
								placeholder="0"
								{...field}
							/>
						)}
					/>
					<View className="grid grid-cols-2 gap-4">
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
						<FormField
							control={form.control}
							name="tax_status"
							render={({ field }) => (
								<FormRadioGroup
									label={t('Tax Status', { _tags: 'core' })}
									customComponent={TaxStatusRadioGroup}
									{...field}
								/>
							)}
						/>
					</View>
				</VStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={form.handleSubmit(handleAdd)}>
						{t('Add to Cart', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
