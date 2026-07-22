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
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';

import { SettingsDangerZone } from './components/settings-danger-zone';
import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { InclExclRadioGroup } from '../components/incl-excl-tax-radio-group';
import { TaxBasedOnSelect } from '../components/tax-based-on-select';
import { TaxClassSelect } from '../components/tax-class-select';
import { TaxDisplayRadioGroup } from '../components/tax-display-radio-group';
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
export function TaxSettings() {
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
		resolver: zodResolver(formSchema as never) as never,
		values: formData,
	});

	/**
	 * Handle form changes and persist to store
	 */
	const handleChange = React.useCallback(
		async (data: z.infer<typeof formSchema>) => {
			await localPatch({
				document: store,
				data,
			});
		},
		[localPatch, store]
	);

	useFormChangeHandler({
		form: form as never,
		onChange: handleChange as never,
	});

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
				context: {
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			setLoading(false);
		}
	}, [http, localPatch, store]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-5">
				<FormErrors />
				<SettingsSection first title={t('settings.tax_calculation', 'Calculation')}>
					<FormField
						control={form.control}
						name="calc_taxes"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow inline label={t('settings.enable_taxes')}>
								<FormSwitch
									value={value === 'yes'}
									onChange={(checked: boolean) => onChange(checked ? 'yes' : 'no')}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="prices_include_tax"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow inline label={t('settings.prices_entered_with_tax')}>
								<FormSwitch
									value={value === 'yes'}
									onChange={(checked: boolean) => onChange(checked ? 'yes' : 'no')}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_based_on"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow label={t('common.calculate_tax_based_on')}>
								<FormSelect
									customComponent={TaxBasedOnSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="shipping_tax_class"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow label={t('settings.shipping_tax_class')}>
								<FormSelect
									customComponent={TaxClassSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_round_at_subtotal"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow inline label={t('settings.round_tax_at_subtotal_level')}>
								<FormSwitch
									value={value === 'yes'}
									onChange={(checked: boolean) => onChange(checked ? 'yes' : 'no')}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('settings.tax_display', 'Display')}>
					<FormField
						control={form.control}
						name="tax_total_display"
						render={({ field }) => (
							<SettingsRow label={t('settings.display_tax_totals')}>
								<FormRadioGroup customComponent={TaxDisplayRadioGroup} {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_shop"
						render={({ field }) => (
							<SettingsRow label={t('settings.display_prices_in_the_shop')}>
								<FormRadioGroup customComponent={InclExclRadioGroup} {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_cart"
						render={({ field }) => (
							<SettingsRow label={t('settings.display_prices_during_cart_and_checkout')}>
								<FormRadioGroup customComponent={InclExclRadioGroup} {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_display_suffix"
						render={({ field }) => (
							<SettingsRow label={t('settings.price_display_suffix')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('tax_rates.tax_rates', 'Tax Rates')}>
					<View className="flex-row py-2">
						<Button
							variant="outline"
							size="sm"
							onPress={() => router.push('/(app)/(modals)/tax-rates')}
						>
							<ButtonText>{t('common.view_all_tax_rates')}</ButtonText>
						</Button>
					</View>
				</SettingsSection>

				<SettingsDangerZone
					description={t(
						'settings.restore_server_settings_description',
						'These settings were copied from your WooCommerce store. Restoring will overwrite local changes with the server’s values.'
					)}
					buttonLabel={t('settings.restore_server_settings')}
					onPress={handleRestoreServerSettings}
					loading={loading}
					testID="settings-tax-restore-server"
				/>
			</VStack>
		</Form>
	);
}
