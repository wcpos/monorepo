import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	Form,
	FormField,
	FormInput,
	FormRadioGroup,
	FormSelect,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { FormErrors } from '../components/form-errors';
import { InclExclRadioGroup } from '../components/incl-excl-tax-radio-group';
import { TaxBasedOnSelect } from '../components/tax-based-on-select';
import { TaxDisplayRadioGroup } from '../components/tax-display-radio-group';
import { useExtraData } from '../contexts/extra-data';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
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
	const { store, site } = useStoreSession();
	const t = useT();
	const router = useRouter();
	const { localPatch } = useLocalMutation();
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
	const yesNo = (value: unknown) => (value === 'yes' ? t('common.yes') : t('common.no'));
	// `url` is optional on the site schema; a site without one gets no link, not a crash.
	const siteUrl = typeof site.url === 'string' ? site.url.replace(/\/+$/, '') : '';
	const wooTaxSettingsUrl = siteUrl ? `${siteUrl}/wp-admin/admin.php?page=wc-settings&tab=tax` : '';

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
			await localPatch({
				document: store,
				data: Object.fromEntries(
					Object.entries(data).filter(([key]) => Object.keys(formSchema.shape).includes(key))
				),
			});
		},
		[localPatch, store]
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
					<SettingsRow
						inline
						label={t('settings.enable_taxes')}
						testID="settings-tax-locked-calc_taxes"
					>
						<Text>{yesNo(lockedSettings.calc_taxes)}</Text>
					</SettingsRow>
					<SettingsRow
						inline
						label={t('settings.prices_entered_with_tax')}
						testID="settings-tax-locked-prices_include_tax"
					>
						<Text>{yesNo(lockedSettings.prices_include_tax)}</Text>
					</SettingsRow>
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
					<SettingsRow
						inline
						label={t('settings.shipping_tax_class')}
						testID="settings-tax-locked-shipping_tax_class"
					>
						<Text>{shippingTaxClassName}</Text>
					</SettingsRow>
					<SettingsRow
						inline
						label={t('settings.round_tax_at_subtotal_level')}
						testID="settings-tax-locked-tax_round_at_subtotal"
					>
						<Text>{yesNo(lockedSettings.tax_round_at_subtotal)}</Text>
					</SettingsRow>
					<Text className="text-muted-foreground text-xs">{t('settings.tax_locked_note')}</Text>
					{wooTaxSettingsUrl ? (
						<DocsLink href={wooTaxSettingsUrl}>{t('settings.tax_locked_link')}</DocsLink>
					) : null}
				</SettingsSection>

				<SettingsSection title={t('settings.tax_display')}>
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
