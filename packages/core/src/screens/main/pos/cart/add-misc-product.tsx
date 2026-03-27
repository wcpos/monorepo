import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
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
import { VStack } from '@wcpos/components/vstack';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

import { useT } from '../../../../contexts/translations';
import { CurrencyInput } from '../../components/currency-input';
import { FormErrors } from '../../components/form-errors';
import { CategoryTreeLoader } from '../../components/product/category-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../components/tax-status-radio-group';
import { useAddProduct } from '../hooks/use-add-product';

const categoryOptionSchema = z.object({ value: z.string(), label: z.string() });

const formSchema = z.object({
	name: z.string().optional(),
	price: z.string().default('0'),
	sku: z.string().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	virtual: z.boolean().default(false),
	downloadable: z.boolean().default(false),
	categories: z.array(categoryOptionSchema).default([]),
});

type FormValues = z.infer<typeof formSchema>;

/**
 *
 */
export function AddMiscProduct() {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { onOpenChange } = useRootContext();
	const [categoryOptions, setCategoryOptions] = React.useState<HierarchicalOption[]>([]);

	/**
	 *
	 */
	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			name: '',
			price: '0',
			sku: '',
			tax_status: 'taxable',
			tax_class: 'standard',
			virtual: false,
			downloadable: false,
			categories: [],
		},
	});

	/**
	 * NOTE: tax_class 'standard' needs to be sent as an empty string, otherwise the API will throw an error.
	 */
	const handleAdd = React.useCallback(
		(data: FormValues) => {
			const { name, price, sku, tax_status, tax_class, virtual, downloadable, categories } = data;
			addProduct({
				id: 0,
				name: isEmpty(name) ? t('common.product') : name,
				price: isEmpty(price) ? '0' : price,
				sku,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status,
				tax_class: tax_class === 'standard' ? '' : tax_class,
				virtual: virtual ?? false,
				downloadable: downloadable ?? false,
				_pos_categories: categories.map((opt) => ({
					id: Number(opt.value),
					name: opt.label,
				})),
			});
			onOpenChange(false);
		},
		[addProduct, onOpenChange, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onAdd = form.handleSubmit(handleAdd);

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
						<FormInput label={t('common.name')} placeholder={t('common.product')} {...field} />
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
						name="price"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={CurrencyInput}
									label={t('common.price')}
									placeholder="0"
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="tax_class"
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={TaxClassSelect}
									label={t('common.tax_class')}
									value={value ?? ''}
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
				<VStack>
					<FormField
						control={form.control}
						name="virtual"
						render={({ field }) => <FormSwitch label={t('products.virtual')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="downloadable"
						render={({ field }) => <FormSwitch label={t('products.downloadable')} {...field} />}
					/>
				</VStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('common.cancel')}</DialogClose>
					<DialogAction testID="add-to-cart-submit" onPress={onAdd}>
						{t('common.add_to_cart')}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
}
