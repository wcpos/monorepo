import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import toNumber from 'lodash/toNumber';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	FormTreeCombobox,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import { isMiscProductLine } from '@wcpos/sync-core';

import { useT } from '../../../../../../contexts/translations';
import { CategoryTreeLoader } from '../../../../components/product/category-select';
import { CurrencyInput } from '../../../../components/currency-input';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { NumberInput, type NumberInputProps } from '../../../../components/number-input';
import { TaxClassSelect } from '../../../../components/tax-class-select';
import { TaxStatusRadioGroup } from '../../../../components/tax-status-radio-group';
import { taxClassFromWire, taxClassToWire } from '../../../../hooks/tax-class';
import { QUANTITY_FORMAT } from '../../../../hooks/use-number-format';
import { useLineItemData } from '../../../hooks/use-line-item-data';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useUpdateCartLine } from '../../../hooks/use-update-cart-line';
import { parsePosData } from '../../../hooks/utils';

const categoryOptionSchema = z.object({ value: z.string(), label: z.string() });

/** The quantity reads at its own scale, as the cart's box does, never the price's (0.125, not 0.13). */
function QuantityField(props: NumberInputProps) {
	return <NumberInput {...props} formatOptions={QUANTITY_FORMAT} />;
}

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
	const { updateCartLine } = useUpdateCartLine();
	// The order this sheet belongs to: a debounced write that lands after the sheet closed and
	// another order was selected still reaches it.
	const { currentOrderRecord } = useCurrentOrder();
	const markSaved = useMarkSaved();
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

	useFormChangeHandler({
		form,
		onChange: (changes) => {
			const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
			const value = form.getValues(root);
			const wireValue =
				root === 'tax_class'
					? taxClassToWire(form.getValues('tax_class'))
					: root === 'categories'
						? form
								.getValues('categories')
								.map((opt) => ({ id: Number(opt.value), name: opt.label }))
						: value;
			return updateCartLine(
				'line_items',
				uuid,
				{ [root]: wireValue },
				{ record: currentOrderRecord }
			).then((written) => {
				if (written) markSaved([root]);
				return Boolean(written);
			});
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<HStack className="justify-between">
								<FormLabel>{t('common.name')}</FormLabel>
								<SavedMark name="name" label={t('settings.saved')} />
							</HStack>
							<FormInput testID="edit-line-item-name-input" {...field} />
						</FormItem>
					)}
				/>
				{isMiscProductLine(item) && (
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
				)}
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
								<FormInput testID="edit-line-item-sku-input" {...field} />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="quantity"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('pos_cart.quantity')}</FormLabel>
									<SavedMark name="quantity" label={t('settings.saved')} />
								</HStack>
								<FormInput
									customComponent={QuantityField}
									testID="edit-line-item-quantity-input"
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="price"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.price')}</FormLabel>
									<SavedMark name="price" label={t('settings.saved')} />
								</HStack>
								<FormInput
									customComponent={CurrencyInput}
									testID="edit-line-item-price-input"
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="regular_price"
						render={({ field: { value, onChange, ...rest } }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.regular_price')}</FormLabel>
									<SavedMark name="regular_price" label={t('settings.saved')} />
								</HStack>
								<FormInput
									customComponent={CurrencyInput}
									testID="edit-line-item-regular_price-input"
									type="numeric"
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</FormItem>
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
									label={t('common.tax_class')}
									customComponent={TaxClassSelect}
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
						render={({ field: { value, onChange, ...rest } }) => (
							<View className="flex-1">
								<FormRadioGroup
									label={t('common.tax_status')}
									customComponent={TaxStatusRadioGroup}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				{isMiscProductLine(item) && (
					<>
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
					</>
				)}
				<MetaDataForm withDisplayValues />
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.close')}</DialogClose>
			</DialogFooter>
		</Form>
	);
}
