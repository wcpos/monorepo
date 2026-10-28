import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormSwitch,
	FormTreeCombobox,
	SavedFieldProvider,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import {
	PropertyAdd,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { isMiscProductLine } from '@wcpos/sync-core';

import { useT } from '../../../../../../contexts/translations';
import { CategoryTreeLoader } from '../../../../components/product/category-select';
import { FormAmountField } from '../../../../components/amount-field';
import { FormErrors } from '../../../../components/form-errors';
import { metaDataSchema } from '../../../../components/meta-data-form';
import { useFieldPresence } from '../../../../components/use-field-presence';
import { taxClassFromWire } from '../../../../hooks/tax-class';
import { useLineItemData } from '../../../hooks/use-line-item-data';
import { parsePosData } from '../../../hooks/utils';
import { CustomFieldRows, TaxRow } from '../cart-line-rows';
import { useCartLineAutosave } from '../use-cart-line-autosave';

const categoryOptionSchema = z.object({ value: z.string(), label: z.string() });

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	sku: z.string().optional(),
	quantity: z.number().optional(),
	price: z.number().optional(),
	regular_price: z.number().optional(),
	tax_status: z.enum(['taxable', 'none']),
	tax_class: z.string().optional(),
	virtual: z.boolean().default(false),
	downloadable: z.boolean().default(false),
	categories: z.array(categoryOptionSchema).default([]),
	meta_data: metaDataSchema,
});

/** The offered facts in canonical order; Regular price is the Price row's `was` group. */
const OFFERED = ['regular_price', 'sku', 'categories', 'virtual', 'downloadable'] as const;
type Offered = (typeof OFFERED)[number];
/** Misc-only facts: a catalogue line never acquires them (ledger line 2). */
const MISC_ONLY: readonly Offered[] = ['categories', 'virtual', 'downloadable'];
/** What each fact's Remove writes back; Regular price goes back to the price. */
const CLEARED = { sku: '', categories: [], virtual: false, downloadable: false };

interface Props {
	uuid: string;
	item: import('@wcpos/query').OrderLineItem;
}

export function EditLineItemForm(props: Props) {
	return (
		<SavedFieldProvider>
			<EditLineItemFormFields {...props} />
		</SavedFieldProvider>
	);
}

function EditLineItemFormFields({ uuid, item }: Props) {
	const t = useT();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price, tax_status } = getLineItemData(item);
	const posData = parsePosData(item);
	const [categoryOptions, setCategoryOptions] = React.useState<HierarchicalOption[]>([]);

	/**
	 *
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: {
			name: item.name,
			sku: item.sku,
			quantity: item.quantity,
			price: toNumber(price),
			regular_price: toNumber(regular_price),
			tax_status,
			tax_class: taxClassFromWire(item.tax_class),
			virtual: posData?.virtual ?? false,
			downloadable: posData?.downloadable ?? false,
			categories:
				posData?.categories?.map((c: { id: number; name: string }) => ({
					value: String(c.id),
					label: c.name,
				})) ?? [],
			meta_data: item.meta_data as FormValues['meta_data'],
		},
	});

	useCartLineAutosave('line_items', uuid, form, (root, value) =>
		root === 'categories'
			? (value as FormValues['categories']).map((opt) => ({
					id: Number(opt.value),
					name: opt.label,
				}))
			: undefined
	);

	const values = useWatch({ control: form.control });
	const write = (name: Offered, value: unknown) =>
		form.setValue(name, value as never, { shouldDirty: true });
	const misc = isMiscProductLine(item);
	const presence = useFieldPresence(
		OFFERED.filter((name) => misc || !MISC_ONLY.includes(name)).map((name) => ({ name })),
		(name) =>
			name === 'regular_price'
				? values.regular_price == null || values.regular_price === values.price
				: name === 'categories'
					? !values.categories?.length
					: !values[name],
		(name) => write(name, name === 'regular_price' ? values.price : CLEARED[name])
	);
	const add = (name: Offered) => {
		presence.add(name);
		// An off-by-default switch arrives switched on (property rows rule 7).
		if (name === 'virtual' || name === 'downloadable') write(name, true);
	};
	const labels: Record<Offered, string> = {
		regular_price: t('common.regular_price'),
		sku: t('common.sku'),
		categories: t('common.categories'),
		virtual: t('products.virtual'),
		downloadable: t('products.downloadable'),
	};
	const removeVerb = (name: Offered) => (
		<PropertyVerb testID={`edit-line-item-remove-${name}`} onPress={() => presence.withdraw(name)}>
			{t('common.remove')}
		</PropertyVerb>
	);
	const toggle = (name: 'virtual' | 'downloadable') => (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => <FormSwitch testID={`edit-line-item-${name}-switch`} {...field} />}
		/>
	);
	const onSale = presence.present.includes('regular_price');

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList prefix="line-item">
					<PropertyRow id="name" label={t('common.name')}>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => <FormInput testID="edit-line-item-name-input" {...field} />}
						/>
					</PropertyRow>
					<PropertyRow id="quantity" label={t('pos_cart.quantity')}>
						<FormField
							control={form.control}
							name="quantity"
							render={({ field }) => (
								<FormAmountField
									kind="quantity"
									testID="edit-line-item-quantity-input"
									{...field}
								/>
							)}
						/>
					</PropertyRow>
					<PropertyRow
						id="price"
						label={t('common.price')}
						name={['price', 'regular_price']}
						verb={onSale ? removeVerb('regular_price') : undefined}
					>
						<HStack className="items-center gap-2">
							<View className="flex-1">
								<FormField
									control={form.control}
									name="price"
									render={({ field }) => (
										<FormAmountField kind="money" testID="edit-line-item-price-input" {...field} />
									)}
								/>
							</View>
							{/* The regular price is its own form item: the screen shows "was", a screen reader
							    hears "Regular Price", never a second "Price" (Codex, #2980). */}
							{onSale && (
								<FormItem nativeID="line-item-regular_price">
									<HStack className="items-center gap-2">
										<FormLabel
											className="text-muted-foreground"
											accessibilityLabel={t('common.regular_price')}
										>
											{t('pos_cart.was')}
										</FormLabel>
										<View className="w-28">
											<FormField
												control={form.control}
												name="regular_price"
												render={({ field }) => (
													<FormAmountField
														kind="money"
														testID="edit-line-item-regular_price-input"
														{...field}
													/>
												)}
											/>
										</View>
									</HStack>
								</FormItem>
							)}
						</HStack>
					</PropertyRow>
					<TaxRow prefix="line-item" />
					{presence.present
						.filter((name) => name !== 'regular_price')
						.map((name) => (
							<PropertyRow
								key={name}
								id={name}
								label={labels[name]}
								verb={removeVerb(name)}
								control={name === 'virtual' || name === 'downloadable' ? toggle(name) : undefined}
							>
								{name === 'sku' ? (
									<FormField
										control={form.control}
										name="sku"
										render={({ field }) => (
											<FormInput testID="edit-line-item-sku-input" {...field} />
										)}
									/>
								) : name === 'categories' ? (
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
								) : null}
							</PropertyRow>
						))}
					<CustomFieldRows prefix="line-item" meta={item.meta_data}>
						{presence.offered.map((name) => (
							<PropertyAdd
								key={name}
								testID={`edit-line-item-add-${name}`}
								label={labels[name]}
								onPress={() => add(name)}
							/>
						))}
					</CustomFieldRows>
				</PropertyList>
			</DialogBody>
			<DialogFooter close />
		</Form>
	);
}
