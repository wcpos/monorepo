import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Form,
	FormField,
	FormInput,
	FormSegmentedControl,
	FormSelect,
	SavedFieldProvider,
	savedKeys,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { PropertyRow } from '@wcpos/components/property-row';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';
import { patchStoreSettings } from '@wcpos/query/user-db';

import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { TAX_BASED_ON, useOptionList } from '../components/option-lists';
import { useTaxSegments } from '../components/tax-segments';
import { useExtraData } from '../contexts/extra-data';
import { INHERIT_TAX_CLASS, taxClassFromWire } from '../hooks/tax-class';

const formSchema = z.object({
	tax_based_on: z.enum(['shipping', 'billing', 'base']).default('base'),
	tax_display_shop: z.enum(['incl', 'excl']).default('excl'),
	tax_display_cart: z.enum(['incl', 'excl']).default('excl'),
	price_display_suffix: z.string().optional(),
	tax_total_display: z.enum(['single', 'itemized']).default('itemized'),
});

/**
 *
 */
export function TaxSettings() {
	return (
		<SavedFieldProvider>
			<TaxSettingsForm />
		</SavedFieldProvider>
	);
}

function TaxSettingsForm() {
	const markSaved = useMarkSaved();
	const { store, site } = useStoreSession();
	const t = useT();
	const taxBasedOn = useOptionList(TAX_BASED_ON);
	const tax = useTaxSegments();
	const router = useRouter();
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses) as {
		name: string;
		slug: string;
	}[];
	const lockedSettings = useDocField(store, (latest) => ({
		calc_taxes: latest.calc_taxes,
		prices_include_tax: latest.prices_include_tax,
		shipping_tax_class: latest.shipping_tax_class,
		tax_round_at_subtotal: latest.tax_round_at_subtotal,
	}));
	// Falls back to the slug while the class list is loading or lacks the stored
	// class: this row is read-only now, so it must never read blank.
	const shippingTaxClassSlug = taxClassFromWire(lockedSettings.shipping_tax_class);
	const shippingTaxClassName =
		lockedSettings.shipping_tax_class === INHERIT_TAX_CLASS
			? t('common.tax_class_based_on_cart_items')
			: (taxClasses?.find((taxClass) => taxClass.slug === shippingTaxClassSlug)?.name ??
				shippingTaxClassSlug);
	// `url` is optional on the site schema; a site without one gets no link, not a crash.
	const siteUrl = typeof site.url === 'string' ? site.url.replace(/\/+$/, '') : '';
	const wooTaxSettingsUrl = siteUrl ? `${siteUrl}/wp-admin/admin.php?page=wc-settings&tab=tax` : '';
	const woo = { where: t('settings.set_in_woocommerce'), href: wooTaxSettingsUrl || undefined };

	/**
	 *
	 */
	const formData = useDocField(store, (latest) => {
		return {
			tax_based_on: latest.tax_based_on,
			tax_display_shop: latest.tax_display_shop,
			tax_display_cart: latest.tax_display_cart,
			price_display_suffix: latest.price_display_suffix,
			tax_total_display: latest.tax_total_display,
		};
	});

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
		async (data: Partial<z.infer<typeof formSchema>>) => {
			// Only a genuine change is acknowledged (see `savedKeys`), and only when the patch applied:
			// `patchStoreSettings` logs and toasts a failed write and resolves undefined.
			const keys = savedKeys(store.getLatest?.() ?? store, data);
			const result = await patchStoreSettings(
				store,
				Object.fromEntries(
					Object.entries(data).filter(([key]) => Object.keys(formSchema.shape).includes(key))
				),
				t
			);
			if (result && keys.length > 0) markSaved(keys);
		},
		[t, store, markSaved]
	);

	useFormChangeHandler({
		form: form as never,
		onChange: handleChange as never,
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-5">
				<FormErrors />
				<SettingsSection first title={t('settings.tax_calculation')}>
					<FormField
						control={form.control}
						name="tax_based_on"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow name="tax_based_on" label={t('common.calculate_tax_based_on')}>
								<FormSelect
									options={taxBasedOn}
									placeholder={t('common.select_tax_based_on')}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</PropertyRow>
						)}
					/>
					<PropertyRow
						label={t('settings.enable_taxes')}
						testID="settings-tax-locked-calc_taxes"
						locked={woo}
					>
						{lockedSettings.calc_taxes === 'yes'}
					</PropertyRow>
					<PropertyRow
						label={t('settings.prices_entered_with_tax')}
						testID="settings-tax-locked-prices_include_tax"
						locked={woo}
					>
						{lockedSettings.prices_include_tax === 'yes'}
					</PropertyRow>
					<PropertyRow
						label={t('settings.shipping_tax_class')}
						testID="settings-tax-locked-shipping_tax_class"
						locked={woo}
					>
						{shippingTaxClassName}
					</PropertyRow>
					<PropertyRow
						label={t('settings.round_tax_at_subtotal_level')}
						testID="settings-tax-locked-tax_round_at_subtotal"
						locked={woo}
					>
						{lockedSettings.tax_round_at_subtotal === 'yes'}
					</PropertyRow>
				</SettingsSection>

				<SettingsSection title={t('settings.tax_display')}>
					<FormField
						control={form.control}
						name="tax_total_display"
						render={({ field }) => (
							<PropertyRow name="tax_total_display" label={t('settings.display_tax_totals')}>
								<FormSegmentedControl {...field} segments={tax.display} testID={field.name} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_shop"
						render={({ field }) => (
							<PropertyRow name="tax_display_shop" label={t('settings.display_prices_in_the_shop')}>
								<FormSegmentedControl {...field} segments={tax.inclExcl} testID={field.name} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="tax_display_cart"
						render={({ field }) => (
							<PropertyRow
								name="tax_display_cart"
								label={t('settings.display_prices_during_cart_and_checkout')}
							>
								<FormSegmentedControl {...field} segments={tax.inclExcl} testID={field.name} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_display_suffix"
						render={({ field }) => (
							<PropertyRow name="price_display_suffix" label={t('settings.price_display_suffix')}>
								<FormInput {...field} />
							</PropertyRow>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('tax_rates.tax_rates')}>
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
			</VStack>
		</Form>
	);
}
