import * as React from 'react';
import { Pressable, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { Form, FormField, FormSwitch, useFormChangeHandler } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Slider } from '@wcpos/components/slider';
import { Text } from '@wcpos/components/text';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { MetaDataKeysField } from './meta-data-keys-field';
import { type BrowseBy, readBrowseBy } from './v2/browse/browse-source';
import { useBrowseCounts } from './v2/browse/use-browse-terms';
import { SORT_FIELD_VALUES } from './filter-bar/filter-bar-layout';
import { useT } from '../../../../contexts/translations';
import {
	columnsFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
} from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

const gridFieldsSchema = z.object({
	name: z.boolean(),
	price: z.boolean(),
	tax: z.boolean(),
	on_sale: z.boolean(),
	category: z.boolean(),
	sku: z.boolean(),
	barcode: z.boolean(),
	stock_quantity: z.boolean(),
	cost_of_goods_sold: z.boolean(),
});

export const schema = z.object({
	viewMode: z.enum(['grid', 'table']),
	variationsStyle: z.enum(['drill', 'inline']).optional(),
	browseBy: z.enum(['all', 'categories', 'tags', 'brands', 'shortcuts']).optional(),
	position: z.enum(['left', 'right']),
	showOutOfStock: z.boolean(),
	sortBy: z.string(),
	sortDirection: z.enum(['asc', 'desc']),
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
	gridColumns: z.number().min(2).max(8),
	gridFields: gridFieldsSchema,
});

const META_DATA_KEYS_DOCS_URL = 'https://docs.wcpos.com/pos/product-panel/meta-data-keys';

/**
 *
 */
export function UISettingsForm() {
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('pos-products');
	const formData = useDocField(uiSettings, (value) => value) as unknown as z.infer<typeof schema>;
	const { setButtonPressHandler } = useDialogContext();
	const t = useT();
	const router = useRouter();

	/**
	 *
	 */
	const form = useForm({
		resolver: zodResolver(schema as never) as never,
		values: formData,
	});

	const viewMode = useWatch({ control: form.control, name: 'viewMode' });

	/**
	 * The reset button lives in the dialog footer, outside this form's subtree, so the
	 * handler has to be published back up to UISettingsDialog. It lands in a ref there,
	 * and writing a ref during render is not allowed — hence an effect rather than a
	 * plain call. Nothing here derives state; it only registers the callback.
	 */
	React.useEffect(() => {
		setButtonPressHandler(() => void resetUI());
	}, [setButtonPressHandler, resetUI]);

	useFormChangeHandler({ form: form as never, onChange: (changes) => void patchUI(changes) });

	/**
	 *
	 */
	return (
		<VStack>
			<Form {...form}>
				<VStack>
					<FormField
						control={form.control}
						name="showOutOfStock"
						render={({ field }) => <FormSwitch label={getUILabel('showOutOfStock')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="viewMode"
						render={({ field: { value, onChange } }) => (
							<View className="gap-1 px-1">
								<Text>{getUILabel('viewMode')}</Text>
								<SegmentedControl
									value={value}
									onValueChange={onChange}
									segments={
										[
											{ value: 'grid', label: t('common.grid'), testID: 'view-mode-grid' },
											{ value: 'table', label: t('common.table'), testID: 'view-mode-table' },
										] satisfies [Segment, Segment]
									}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="variationsStyle"
						render={({ field: { value, onChange } }) => (
							<View className="gap-1 px-1">
								<Text>{t('pos_products.variations_style')}</Text>
								<SegmentedControl
									value={value ?? 'drill'}
									onValueChange={onChange}
									segments={[
										{
											value: 'drill',
											label: t('pos_products.variations_open_in_place'),
											testID: 'products-variations-style-drill',
										},
										{
											value: 'inline',
											label: t('pos_products.variations_popover_and_rows'),
											testID: 'products-variations-style-inline',
										},
									]}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="browseBy"
						render={({ field: { value, onChange } }) => (
							<BrowseByField value={readBrowseBy(value)} onChange={onChange} />
						)}
					/>
					<FormField
						control={form.control}
						name="position"
						render={({ field: { value, onChange } }) => (
							<View className="gap-1 px-1">
								<Text>{getUILabel('position')}</Text>
								<SegmentedControl
									value={value}
									onValueChange={(val) => onChange(val || value)}
									segments={
										[
											{
												value: 'left',
												label: t('pos_products.products_left'),
												testID: 'panel-position-left',
											},
											{
												value: 'right',
												label: t('pos_products.products_right'),
												testID: 'panel-position-right',
											},
										] satisfies [Segment, Segment]
									}
								/>
							</View>
						)}
					/>
					<HStack className="items-end px-1">
						<FormField
							control={form.control}
							name="sortBy"
							render={({ field: { value, onChange } }) => {
								const sortLabels: Record<string, string> = {
									name: t('common.name'),
									sku: t('common.sku'),
									barcode: t('common.barcode'),
									sortable_price: t('common.price'),
									date_created_gmt: t('common.date_created'),
									date_modified_gmt: t('common.date_modified'),
									total_sales: t('common.popularity'),
									stock_quantity: t('products.stock_quantity'),
									stock_status: t('common.stock_status'),
									menu_order: t('common.menu_order'),
								};
								return (
									<View className="flex-1 gap-1">
										<Text>{getUILabel('sortBy')}</Text>
										<Select
											value={{ value, label: sortLabels[value] ?? value }}
											onValueChange={(val) => onChange(val?.value || 'name')}
										>
											<SelectTrigger>
												<SelectValue placeholder={getUILabel('sortBy')} />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{SORT_FIELD_VALUES.map((v) => (
														<SelectItem key={v} label={sortLabels[v]} value={v} />
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</View>
								);
							}}
						/>
						<FormField
							control={form.control}
							name="sortDirection"
							render={({ field: { value, onChange } }) => (
								<View className="gap-1">
									<Text>{getUILabel('sortDirection')}</Text>
									<SegmentedControl
										value={value}
										onValueChange={(val) => onChange(val || value)}
										segments={
											[
												{
													value: 'asc',
													label: t('common.ascending'),
													testID: 'sort-direction-asc',
												},
												{
													value: 'desc',
													label: t('common.descending'),
													testID: 'sort-direction-desc',
												},
											] satisfies [Segment, Segment]
										}
									/>
								</View>
							)}
						/>
					</HStack>
					{viewMode === 'grid' ? (
						<VStack>
							<FormField
								control={form.control}
								name="gridColumns"
								render={({ field }) => (
									<View className="gap-2 px-1">
										<HStack className="items-center justify-between">
											<Text>{getUILabel('gridColumns')}</Text>
											<Text className="text-muted-foreground">{field.value}</Text>
										</HStack>
										<Slider
											value={field.value}
											onValueChange={field.onChange}
											min={2}
											max={8}
											step={1}
										/>
									</View>
								)}
							/>
							<View className="gap-2 px-1 pt-2">
								<Text className="font-medium">{t('common.tile_fields')}</Text>
								{(
									[
										'name',
										'price',
										'tax',
										'on_sale',
										'category',
										'sku',
										'barcode',
										'stock_quantity',
										'cost_of_goods_sold',
									] as const
								).map((fieldKey) => (
									<FormField
										key={fieldKey}
										control={form.control}
										name={`gridFields.${fieldKey}`}
										render={({ field }) => <FormSwitch label={getUILabel(fieldKey)} {...field} />}
									/>
								))}
							</View>
						</VStack>
					) : (
						<UISettingsColumnsForm getUILabel={getUILabel} />
					)}
					<View className="gap-1 px-1">
						<HStack className="items-center justify-between">
							<Text>{getUILabel('metaDataKeys')}</Text>
							<DocsLink testID="meta-data-keys-docs-link" href={META_DATA_KEYS_DOCS_URL}>
								{t('common.learn_more')}
							</DocsLink>
						</HStack>
						<FormField
							control={form.control}
							name="metaDataKeys"
							render={({ field }) => (
								<MetaDataKeysField value={field.value} onChange={field.onChange} />
							)}
						/>
						<Text className="text-muted-foreground text-sm">
							{t('pos_products.meta_data_keys_description')}
						</Text>
					</View>
					<View className="gap-2 px-1 pt-2">
						<Text className="font-medium">{getUILabel('filterBar')}</Text>
						<Text className="text-muted-foreground text-sm">
							{t('pos_products.filter_bar_description')}
						</Text>
						<Button
							variant="outline"
							testID="customize-filter-bar"
							onPress={() => router.push('/(app)/(modals)/filter-bar')}
						>
							<ButtonText>{t('pos_products.customize_filter_bar')}</ButtonText>
						</Button>
					</View>
				</VStack>
			</Form>
		</VStack>
	);
}

/**
 * Browse by: a radio list, not a segmented control — five labels do not fit a segment row in
 * German. Each source shows how many terms it would put on the stage; one that has answered
 * empty is dimmed and says why.
 */
function BrowseByField({
	value,
	onChange,
}: {
	value: BrowseBy;
	onChange: (value: BrowseBy) => void;
}) {
	const t = useT();
	const counts = useBrowseCounts();
	const rows: { value: BrowseBy; label: string; count?: string; empty?: string }[] = [
		{ value: 'all', label: t('pos_products.browse_all_products') },
		{
			value: 'categories',
			label: t('pos_products.browse_categories'),
			count: t('pos_products.n_categories', { count: counts.categories }),
			empty: t('pos_products.no_categories_yet'),
		},
		{
			value: 'tags',
			label: t('pos_products.browse_tags'),
			count: t('pos_products.n_tags', { count: counts.tags }),
			empty: t('pos_products.no_tags_yet'),
		},
		{
			value: 'brands',
			label: t('pos_products.browse_brands'),
			count: t('pos_products.n_brands', { count: counts.brands }),
			empty: t('pos_products.no_brands_yet'),
		},
		{
			value: 'shortcuts',
			label: t('pos_products.browse_shortcuts'),
			count: t('pos_products.n_quick_filters', { count: counts.shortcuts }),
			empty: t('pos_products.no_shortcuts_yet'),
		},
	];
	return (
		<View className="gap-1 px-1">
			<Text>{t('pos_products.browse_by')}</Text>
			<View
				role="radiogroup"
				aria-label={t('pos_products.browse_by')}
				className="border-border overflow-hidden rounded-lg border"
			>
				{rows.map((row) => {
					// Dimmed only once the source has answered empty; a loading source is still a choice.
					const count = row.value === 'all' ? undefined : counts[row.value];
					const disabled = count === 0;
					const on = row.value === value;
					return (
						// `role`/`aria-*`, not `accessibilityState`: react-native-web drops the
						// latter, so the web build would lose checked and disabled (as SegmentedControl).
						<Pressable
							key={row.value}
							disabled={disabled}
							role="radio"
							aria-checked={on}
							aria-disabled={disabled}
							onPress={() => onChange(row.value)}
							className={`border-border active:bg-muted min-h-ctl flex-row items-center gap-2 border-b px-3 last:border-b-0 ${on ? 'bg-muted' : ''}`}
							testID={`ui-settings-browse-by-${row.value}`}
						>
							<Icon name="check" className={on ? 'text-primary' : 'opacity-0'} />
							<Text className={`flex-1 ${disabled ? 'text-muted-foreground' : ''}`}>
								{row.label}
							</Text>
							<Text className="text-muted-foreground text-xs">
								{disabled ? row.empty : count === undefined ? '' : row.count}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}
