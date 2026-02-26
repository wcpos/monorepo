import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
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
import { VStack } from '@wcpos/components/vstack';

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
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
	gridColumns: z.number().min(2).max(8),
	gridFields: gridFieldsSchema,
});

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
						<>
							<UISettingsColumnsForm columns={initialData.columns} getUILabel={getUILabel} />
							<FormField
								control={form.control}
								name="metaDataKeys"
								render={({ field }) => (
									<FormInput
										label={getUILabel('metaDataKeys')}
										description={t('pos_products.a_list_of_product_meta_keys')}
										{...field}
									/>
								)}
							/>
						</>
					)}
				</VStack>
			</Form>
		</VStack>
	);
}
