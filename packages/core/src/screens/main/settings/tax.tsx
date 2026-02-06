import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { InclExclRadioGroup } from '../components/incl-excl-tax-radio-group';
import { TaxBasedOnSelect } from '../components/tax-based-on-select';
import { TaxClassSelect } from '../components/tax-class-select';
import { TaxDisplayRadioGroup } from '../components/tax-display-radio-group';
import { YesNoRadioGroup } from '../components/yes-no-radio-group';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const uiLogger = getLogger(['wcpos', 'ui', 'settings']);

const formSchema = z.object({
	calc_taxes: z.enum(['yes', 'no']),
	prices_include_tax: z.enum(['yes', 'no']),
	tax_based_on: z.enum(['shipping', 'billing', 'base']).default('base'),
	shipping_tax_class: z.string(),
	tax_round_at_subtotal: z.enum(['yes', 'no']),
	tax_display_shop: z.enum(['incl', 'excl']).default('excl'),
	tax_display_cart: z.enum(['incl', 'excl']).default('excl'),
	price_display_suffix: z.string().optional(),
	tax_total_display: z.enum(['single', 'itemized']).default('itemized'),
});

/**
 *
 */
export const TaxSettings = () => {
	const { store } = useAppState();
	const t = useT();
	const router = useRouter();
	const { localPatch } = useLocalMutation();
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);

	/**
	 *
	 */
	const formData = useObservablePickState(
		store.$,
		() => {
			const latest = store.getLatest();
			return {
				calc_taxes: latest.calc_taxes,
				prices_include_tax: latest.prices_include_tax,
				tax_based_on: latest.tax_based_on,
				shipping_tax_class: latest.shipping_tax_class,
				tax_round_at_subtotal: latest.tax_round_at_subtotal,
				tax_display_shop: latest.tax_display_shop,
				tax_display_cart: latest.tax_display_cart,
				price_display_suffix: latest.price_display_suffix,
				tax_total_display: latest.tax_total_display,
			};
		},
		'calc_taxes',
		'prices_include_tax',
		'tax_based_on',
		'shipping_tax_class',
		'tax_round_at_subtotal',
		'tax_display_shop',
		'tax_display_cart',
		'price_display_suffix',
		'tax_total_display'
	);

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		values: formData,
	});

	/**
	 * Handle form changes and persist to store
	 */
	const handleChange = React.useCallback(
		async (data) => {
			await localPatch({
				document: store,
				data,
			});
		},
		[localPatch, store]
	);

	useFormChangeHandler({ form, onChange: handleChange });

	/**
	 * Restore server settings
	 */
	const handleRestoreServerSettings = React.useCallback(async () => {
		setLoading(true);
		try {
			const response = await http.get(`stores/${store.id}`);
			const data = response.data;
			await localPatch({
				document: store,
				data: {
					calc_taxes: data.calc_taxes,
					prices_include_tax: data.prices_include_tax,
					tax_based_on: data.tax_based_on,
					shipping_tax_class: data.shipping_tax_class,
					tax_round_at_subtotal: data.tax_round_at_subtotal,
					tax_display_shop: data.tax_display_shop,
					tax_display_cart: data.tax_display_cart,
					price_display_suffix: data.price_display_suffix,
					tax_total_display: data.tax_total_display,
				},
			});
		} catch (error) {
			uiLogger.error('Failed to restore server settings', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		} finally {
			setLoading(false);
		}
	}, [http, localPatch, store]);

	/**
	 *
	 */
	return (
		<VStack>
			<View className="flex-row">
				<Button variant="muted" onPress={() => router.push('/(app)/(modals)/tax-rates')}>
					<ButtonText>{t('common.view_all_tax_rates')}</ButtonText>
				</Button>
			</View>
			<Form {...form}>
				<VStack className="gap-4">
					<FormErrors />
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="calc_taxes"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={YesNoRadioGroup}
										label={t('settings.enable_taxes')}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="prices_include_tax"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={YesNoRadioGroup}
										label={t('settings.prices_entered_with_tax')}
										{...field}
									/>
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="tax_based_on"
							render={({ field }) => (
								<View className="flex-1">
									<FormSelect
										customComponent={TaxBasedOnSelect}
										label={t('common.calculate_tax_based_on')}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="shipping_tax_class"
							render={({ field }) => (
								<View className="flex-1">
									<FormSelect
										customComponent={TaxClassSelect}
										label={t('settings.shipping_tax_class')}
										{...field}
									/>
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="tax_total_display"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={TaxDisplayRadioGroup}
										label={t('settings.display_tax_totals')}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_round_at_subtotal"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={YesNoRadioGroup}
										label={t('settings.round_tax_at_subtotal_level')}
										{...field}
									/>
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="tax_display_shop"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={InclExclRadioGroup}
										label={t('settings.display_prices_in_the_shop')}
										{...field}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="tax_display_cart"
							render={({ field }) => (
								<View className="flex-1">
									<FormRadioGroup
										customComponent={InclExclRadioGroup}
										label={t('settings.display_prices_during_cart_and_checkout')}
										{...field}
									/>
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="price_display_suffix"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('settings.price_display_suffix')} {...field} />
								</View>
							)}
						/>
						<View className="flex-1"></View>
					</HStack>
					<ModalFooter className="px-0">
						<Button variant="destructive" onPress={handleRestoreServerSettings} loading={loading}>
							{t('settings.restore_server_settings')}
						</Button>
						<ModalClose>{t('common.close')}</ModalClose>
					</ModalFooter>
				</VStack>
			</Form>
		</VStack>
	);
};
