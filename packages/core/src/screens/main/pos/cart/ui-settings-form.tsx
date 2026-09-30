import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSelect,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import {
	columnsFormSchema,
	UISettingsColumnsForm,
	useDialogContext,
} from '../../components/ui-settings';
import { useUISettings } from '../../contexts/ui-settings';

export const schema = z.object({
	openOrdersPosition: z.enum(['top', 'bottom']),
	autoShowReceipt: z.boolean(),
	sortLines: z.enum(['newest_bottom', 'newest_top', 'name', 'price']).optional(),
	autoPrintReceipt: z.boolean(),
	// quickDiscounts: z.array(z.number()).optional(),
	quickDiscounts: z.string().optional(),
	...columnsFormSchema.shape,
});

/**
 *
 */
export function UISettingsForm() {
	const t = useT();
	const sortOptions = [
		{ value: 'newest_bottom', label: t('pos_cart.sort_newest_bottom') },
		{ value: 'newest_top', label: t('pos_cart.sort_newest_top') },
		{ value: 'name', label: t('pos_cart.sort_by_name') },
		{ value: 'price', label: t('pos_cart.sort_by_price') },
	];
	const { uiSettings, getUILabel, resetUI, patchUI } = useUISettings('pos-cart');
	const formData = useDocField(uiSettings, (value) => value) as unknown as z.infer<typeof schema>;
	const { setButtonPressHandler } = useDialogContext();

	/**
	 * The reset button lives in the dialog footer, outside this form's subtree, so the
	 * handler has to be published back up to UISettingsDialog. It lands in a ref there,
	 * and writing a ref during render is not allowed — hence an effect rather than a
	 * plain call. Nothing here derives state; it only registers the callback.
	 */
	React.useEffect(() => {
		setButtonPressHandler(() => void resetUI());
	}, [setButtonPressHandler, resetUI]);

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm({
		resolver: zodResolver(schema as never) as never,
		values: formData,
	});

	/**
	 *
	 */
	useFormChangeHandler({ form: form as never, onChange: (changes) => void patchUI(changes) });

	/**
	 *
	 */
	return (
		<VStack space="lg">
			<Form {...form}>
				<VStack>
					<FormField
						control={form.control}
						name="autoShowReceipt"
						render={({ field }) => (
							<FormSwitch
								label={getUILabel('autoShowReceipt')}
								testID="cart-setting-auto-show-receipt"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="autoPrintReceipt"
						render={({ field }) => (
							<FormSwitch
								label={getUILabel('autoPrintReceipt')}
								testID="cart-setting-auto-print-receipt"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="quickDiscounts"
						render={({ field }) => <FormInput label={getUILabel('quickDiscounts')} {...field} />}
					/>
					<FormField
						control={form.control}
						name="openOrdersPosition"
						render={({ field: { value, onChange } }) => (
							<View className="gap-1 px-1">
								<Text>{getUILabel('openOrdersPosition')}</Text>
								<SegmentedControl
									value={value}
									onValueChange={(val) => onChange(val || value)}
									segments={
										[
											{ value: 'top', label: t('common.top'), testID: 'open-orders-position-top' },
											{
												value: 'bottom',
												label: t('common.bottom'),
												testID: 'open-orders-position-bottom',
											},
										] satisfies [Segment, Segment]
									}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="sortLines"
						render={({ field }) => (
							<View className="gap-1">
								<FormSelect
									{...field}
									label={t('pos_cart.sort_items')}
									value={sortOptions.find(
										(option) => option.value === (field.value ?? 'newest_bottom')
									)}
								>
									<SelectTrigger testID="cart-sort-items">
										<SelectValue placeholder={t('pos_cart.sort_items')} />
									</SelectTrigger>
									<SelectContent portalHost="pos">
										{sortOptions.map((option) => (
											<SelectItem key={option.value} {...option} />
										))}
									</SelectContent>
								</FormSelect>
								<Text className="text-muted-foreground text-sm">
									{t('pos_cart.sort_fees_shipping_last')}
								</Text>
							</View>
						)}
					/>
					<UISettingsColumnsForm getUILabel={getUILabel} />
				</VStack>
			</Form>
		</VStack>
	);
}
