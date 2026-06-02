import * as React from 'react';
import { Pressable, View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

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
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { MetaDataKeysField } from './meta-data-keys-field';
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
	showOutOfStock: z.boolean(),
	sortBy: z.string(),
	sortDirection: z.enum(['asc', 'desc']),
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
	gridColumns: z.number().min(2).max(8),
	gridFields: gridFieldsSchema,
});

/** Sortable product fields, stored as the underlying DB field name. */
const SORT_FIELD_VALUES = ['name', 'date_created_gmt', 'sortable_price', 'total_sales'] as const;

const META_DATA_KEYS_DOCS_URL = 'https://docs.wcpos.com/pos/product-panel/meta-data-keys';

/**
 *
 */
export function UISettingsForm() {
	const { uiSettings, getUILabel, patchUI, resetUI } = useUISettings('pos-products');
	// Get initial data once - don't subscribe to changes while editing
	const initialData = React.useMemo(() => uiSettings.get(), [uiSettings]);
	const { setButtonPressHandler } = useDialogContext();
	const t = useT();

	/**
	 *
	 */
	const form = useForm({
		resolver: zodResolver(schema as never) as never,
		defaultValues: initialData,
	});

	const viewMode = form.watch('viewMode');

	/**
	 * Handle reset button - set handler in effect to avoid mutating ref during render
	 */
	const handleReset = React.useCallback(async () => {
		await resetUI();
		form.reset(uiSettings.get());
	}, [resetUI, form, uiSettings]);

	React.useEffect(() => {
		setButtonPressHandler(handleReset);
	}, [setButtonPressHandler, handleReset]);

	/**
	 * Form is the source of truth during editing.
	 * Changes are saved to RxDB but we don't re-sync back to avoid loops.
	 */
	useFormChangeHandler({ form: form as never, onChange: patchUI });

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
						name="sortBy"
						render={({ field: { value, onChange } }) => {
							const sortLabels: Record<string, string> = {
								name: t('common.name'),
								date_created_gmt: t('common.date_created'),
								sortable_price: t('common.price'),
								total_sales: t('common.popularity'),
							};
							return (
								<View className="gap-1 px-1">
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
							<View className="gap-1 px-1">
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
						<UISettingsColumnsForm columns={initialData.columns} getUILabel={getUILabel} />
					)}
					<View className="gap-1 px-1">
						<HStack className="items-center justify-between">
							<Text>{getUILabel('metaDataKeys')}</Text>
							<Pressable onPress={() => openExternalURL(META_DATA_KEYS_DOCS_URL)}>
								<Text variant="link" className="text-sm">
									{t('common.learn_more')}
								</Text>
							</Pressable>
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
				</VStack>
			</Form>
		</VStack>
	);
}
