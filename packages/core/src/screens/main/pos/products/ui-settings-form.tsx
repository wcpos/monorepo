import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { useDialog } from '@wcpos/components/dialog';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	Form,
	FormField,
	FormSegmentedControl,
	FormSelect,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { SectionHeading } from '@wcpos/components/section-heading';
import { Slider } from '@wcpos/components/slider';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { MetaDataKeysField } from './meta-data-keys-field';
import { type BrowseBy, readBrowseBy } from './browse/browse-source';
import { useBrowseCounts } from './browse/use-browse-terms';
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
	const { close } = useDialog();

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
						render={({ field }) => (
							<FormSegmentedControl
								{...field}
								label={getUILabel('viewMode')}
								testID="view-mode"
								segments={[
									{ value: 'grid', label: t('common.grid') },
									{ value: 'table', label: t('common.table') },
								]}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="variationsStyle"
						render={({ field }) => (
							<FormSegmentedControl
								{...field}
								label={t('pos_products.variations_style')}
								testID="products-variations-style"
								value={field.value ?? 'drill'}
								segments={[
									{ value: 'drill', label: t('pos_products.variations_open_in_place') },
									{
										value: 'inline',
										// What the inline style does in the view the form is set to: a popover on
										// a tile, expanded rows under a table row.
										label:
											viewMode === 'grid'
												? t('pos_products.variations_popover')
												: t('pos_products.variations_expanded_rows'),
									},
								]}
							/>
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
						render={({ field }) => (
							<FormSegmentedControl
								{...field}
								label={getUILabel('position')}
								testID="panel-position"
								segments={[
									{ value: 'left', label: t('pos_products.products_left') },
									{ value: 'right', label: t('pos_products.products_right') },
								]}
							/>
						)}
					/>
					<HStack className="items-end px-1">
						<FormField
							control={form.control}
							name="sortBy"
							render={({ field }) => {
								const sortLabels: Record<string, string> = {
									name: t('common.name'),
									sku: t('common.sku'),
									barcode: t('common.barcode'),
									type: t('common.type'),
									sortable_price: t('common.price'),
									date_created_gmt: t('common.date_created'),
									date_modified_gmt: t('common.date_modified'),
									total_sales: t('common.popularity'),
									stock_quantity: t('products.stock_quantity'),
									stock_status: t('common.stock_status'),
									menu_order: t('common.menu_order'),
								};
								return (
									<View className="flex-1">
										<FormSelect
											{...field}
											label={getUILabel('sortBy')}
											options={SORT_FIELD_VALUES.map((v) => ({ value: v, label: sortLabels[v] }))}
											placeholder={getUILabel('sortBy')}
										/>
									</View>
								);
							}}
						/>
						<FormField
							control={form.control}
							name="sortDirection"
							render={({ field }) => (
								<FormSegmentedControl
									{...field}
									label={getUILabel('sortDirection')}
									testID="sort-direction"
									segments={[
										{ value: 'asc', label: t('common.ascending') },
										{ value: 'desc', label: t('common.descending') },
									]}
								/>
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
								<SectionHeading title={t('common.tile_fields')} />
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
						<Text variant="key">{t('pos_products.meta_data_keys_description')}</Text>
					</View>
					<View className="gap-2 px-1 pt-2">
						<SectionHeading
							title={getUILabel('filterBar')}
							description={t('pos_products.filter_bar_description')}
						/>
						<Button
							variant="outline"
							testID="customize-filter-bar"
							onPress={() => {
								close();
								router.push('/(app)/(modals)/filter-bar');
							}}
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
	const rows: { value: BrowseBy; label: string; countLabel?: string; empty?: string }[] = [
		{ value: 'all', label: t('pos_products.browse_all_products') },
		{
			value: 'categories',
			label: t('pos_products.browse_categories'),
			countLabel: t('pos_products.n_categories', { count: counts.categories }),
			empty: t('pos_products.no_categories_yet'),
		},
		{
			value: 'tags',
			label: t('pos_products.browse_tags'),
			countLabel: t('pos_products.n_tags', { count: counts.tags }),
			empty: t('pos_products.no_tags_yet'),
		},
		{
			value: 'brands',
			label: t('pos_products.browse_brands'),
			countLabel: t('pos_products.n_brands', { count: counts.brands }),
			empty: t('pos_products.no_brands_yet'),
		},
		{
			value: 'shortcuts',
			label: t('pos_products.browse_shortcuts'),
			countLabel: t('pos_products.n_quick_filters', { count: counts.shortcuts }),
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
						<ListRow
							key={row.value}
							size="sm"
							selected={on}
							disabled={disabled}
							role="radio"
							aria-checked={on}
							aria-disabled={disabled}
							onPress={() => onChange(row.value)}
							className="gap-2 last:border-b-0"
							testID={`ui-settings-browse-by-${row.value}`}
							leading={<Icon name="check" className={on ? 'text-primary' : 'opacity-0'} />}
							trailing={
								<Text variant="help">
									{disabled ? row.empty : count === undefined ? '' : row.countLabel}
								</Text>
							}
						>
							<Text>{row.label}</Text>
						</ListRow>
					);
				})}
			</View>
		</View>
	);
}
