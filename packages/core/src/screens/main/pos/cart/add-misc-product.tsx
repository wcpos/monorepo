import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import isEmpty from 'lodash/isEmpty';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormSwitch,
	FormTreeCombobox,
} from '@wcpos/components/form';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { MISC_PRODUCT_ID } from '@wcpos/sync-core';

import { useT } from '../../../../contexts/translations';
import { FormAmountField } from '../../components/amount-field';
import { FormErrors } from '../../components/form-errors';
import { CategoryTreeLoader } from '../../components/product/category-select';
import { TaxSelect } from '../../components/tax-select';
import { useFieldPresence } from '../../components/use-field-presence';
import { taxClassToWire } from '../../hooks/tax-class';
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

/** The offered facts in canonical order, and what Remove writes back. */
const OFFERED = [
	{ name: 'sku', cleared: '' },
	{ name: 'categories', cleared: [] },
	{ name: 'virtual', cleared: false },
	{ name: 'downloadable', cleared: false },
] as const;
type Offered = (typeof OFFERED)[number]['name'];

/**
 *
 */
export function AddMiscProduct() {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { close: closeDialog } = useDialog();
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

	const handleAdd = React.useCallback(
		async (data: FormValues) => {
			const { name, price, sku, tax_status, tax_class, virtual, downloadable, categories } = data;
			await addProduct({
				id: MISC_PRODUCT_ID,
				name: isEmpty(name) ? t('common.product') : name,
				price: isEmpty(price) ? '0' : price,
				sku,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status,
				tax_class: taxClassToWire(tax_class),
				virtual: virtual ?? false,
				downloadable: downloadable ?? false,
				_pos_categories: categories.map((opt) => ({
					id: Number(opt.value),
					name: opt.label,
				})),
			});
			closeDialog();
		},
		[addProduct, closeDialog, t]
	);

	const onAdd = form.handleSubmit(handleAdd);
	const values = useWatch({ control: form.control });
	const write = (name: Offered, value: unknown) =>
		form.setValue(name, value as never, { shouldDirty: true });
	const presence = useFieldPresence(
		OFFERED,
		(name) => (name === 'categories' ? !values.categories?.length : !values[name]),
		(name) => write(name, OFFERED.find((field) => field.name === name)?.cleared)
	);
	const add = (name: Offered) => {
		presence.add(name);
		// An off-by-default switch arrives switched on (property rows rule 7).
		if (name === 'virtual' || name === 'downloadable') write(name, true);
	};
	const labels: Record<Offered, string> = {
		sku: t('common.sku'),
		categories: t('common.categories'),
		virtual: t('products.virtual'),
		downloadable: t('products.downloadable'),
	};
	const toggle = (name: 'virtual' | 'downloadable') => (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem nativeID={`misc-product-${name}`}>
					<FormSwitch testID={`misc-product-${name}-switch`} {...field} />
				</FormItem>
			)}
		/>
	);
	const offeredValue: Record<Offered, React.ReactNode> = {
		sku: (
			<FormField
				control={form.control}
				name="sku"
				render={({ field }) => (
					<FormItem nativeID="misc-product-sku">
						<FormInput testID="misc-product-sku-input" {...field} />
					</FormItem>
				)}
			/>
		),
		categories: (
			<FormField
				control={form.control}
				name="categories"
				render={({ field }) => (
					<FormItem nativeID="misc-product-categories">
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
		),
		virtual: null,
		downloadable: null,
	};

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList prefix="misc-product">
					<PropertyRow label={t('common.name')} id="name" testID="misc-product-row-name">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem nativeID="misc-product-name">
									<FormInput placeholder={t('common.product')} {...field} />
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow label={t('common.price')} id="price" testID="misc-product-row-price">
						<FormField
							control={form.control}
							name="price"
							render={({ field }) => (
								<FormItem nativeID="misc-product-price">
									<FormAmountField
										kind="money"
										live
										placeholder="0"
										testID="misc-product-price-input"
										{...field}
									/>
								</FormItem>
							)}
						/>
					</PropertyRow>
					<PropertyRow label={t('common.tax')} id="tax" testID="misc-product-row-tax">
						<TaxSelect
							status={values.tax_status ?? 'taxable'}
							taxClass={values.tax_class ?? 'standard'}
							onChange={(next) => {
								form.setValue('tax_status', next.tax_status);
								form.setValue('tax_class', next.tax_class);
							}}
							testID="misc-product-tax-select"
							aria-labelledby="misc-product-tax-form-item"
						/>
					</PropertyRow>
					{presence.present.map((name) => (
						<PropertyRow
							key={name}
							label={labels[name]}
							id={name}
							testID={`misc-product-row-${name}`}
							control={(name === 'virtual' || name === 'downloadable') && toggle(name)}
							verb={
								<PropertyVerb
									testID={`misc-product-remove-${name}`}
									onPress={() => presence.withdraw(name)}
								>
									{t('common.remove')}
								</PropertyVerb>
							}
						>
							{offeredValue[name]}
						</PropertyRow>
					))}
					<PropertyAddRow>
						{presence.offered.map((name) => (
							<PropertyAdd
								key={name}
								testID={`misc-product-add-${name}`}
								label={labels[name]}
								onPress={() => add(name)}
							/>
						))}
					</PropertyAddRow>
				</PropertyList>
			</DialogBody>
			<DialogFooter
				close
				intent={{
					label: t('common.add_to_cart'),
					disabled: form.formState.isSubmitting,
					testID: 'add-to-cart-submit',
					onPress: () => void onAdd(),
				}}
			/>
		</Form>
	);
}
