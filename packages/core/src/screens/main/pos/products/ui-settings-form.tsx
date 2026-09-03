import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { Form, FormField, FormSwitch, useFormChangeHandler } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
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
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/toggle-group';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { MetaDataKeysField } from './meta-data-keys-field';
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
								<Select
									value={{
										value,
										label: value === 'grid' ? t('common.grid') : t('common.table'),
									}}
									onValueChange={(val) => onChange(val?.value || 'table')}
								>
									<SelectTrigger>
										<SelectValue placeholder={getUILabel('viewMode')} />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem label={t('common.grid')} value="grid" />
											<SelectItem label={t('common.table')} value="table" />
										</SelectGroup>
									</SelectContent>
								</Select>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="position"
						render={({ field: { value, onChange } }) => (
							<View className="gap-1 px-1">
								<Text>{getUILabel('position')}</Text>
								<ToggleGroup
									type="single"
									value={value}
									onValueChange={(val) => onChange(val || value)}
								>
									<ToggleGroupItem value="left" testID="panel-position-left">
										<Text>{t('pos_products.products_left')}</Text>
									</ToggleGroupItem>
									<ToggleGroupItem value="right" testID="panel-position-right">
										<Text>{t('pos_products.products_right')}</Text>
									</ToggleGroupItem>
								</ToggleGroup>
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
									<ToggleGroup
										type="single"
										value={value}
										onValueChange={(val) => onChange(val || value)}
									>
										<ToggleGroupItem value="asc" testID="sort-direction-asc">
											<Text>{t('common.ascending')}</Text>
										</ToggleGroupItem>
										<ToggleGroupItem value="desc" testID="sort-direction-desc">
											<Text>{t('common.descending')}</Text>
										</ToggleGroupItem>
									</ToggleGroup>
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
