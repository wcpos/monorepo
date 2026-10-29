import * as React from 'react';

import { decode } from 'html-entities';
import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableSuspense } from 'observable-hooks';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import * as Alert from '@wcpos/components/alert-dialog';
import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { Suspense } from '@wcpos/components/suspense';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormSwitch,
	SavedFieldProvider,
	savedKeys,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { PropertyRow } from '@wcpos/components/property-row';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import {
	getServerOwnedStorePatch,
	patchStoreSettings,
	SERVER_OWNED_STORE_FIELDS,
} from '@wcpos/query/user-db';
import { useDocField } from '@wcpos/query';

import { CountriesProvider, useCountries } from '../../../contexts/countries';
import { SettingsDangerZone } from './components/settings-danger-zone';
import { ClearLocalData } from '../pos/cart/clear-local-data';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { FormAmountField } from '../components/amount-field';
import { FormErrors } from '../components/form-errors';
import { LanguageSelect } from '../components/language-select';
import { useOptionLists } from '../components/option-lists';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { useDefaultCustomer } from '../hooks/use-default-customer';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { reportRestoreFailure } from './restore-failure';

const uiLogger = getLogger(['wcpos', 'ui', 'settings']);

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	store_country: z.string().optional(),
	store_state: z.string().optional(),
	store_city: z.string().optional(),
	store_postcode: z.string().optional(),
	locale: z.string().optional(),
	// The customer select hands back a string id; the gate in useFormChangeHandler validates
	// before it writes, so the schema coerces what the control gives (the write is unchanged).
	default_customer: z.coerce.number().default(0),
	default_customer_is_cashier: z.boolean().default(false),
	currency: z.string().default('USD'),
	currency_pos: z.string().default('left'),
	price_thousand_sep: z.string().default(','),
	price_decimal_sep: z.string().default('.'),
	// Woo's own field is a number with min 0, step 1 and no max (class-wc-settings-general.php).
	price_num_decimals: z.coerce.number().int().min(0).default(2),
	thousands_group_style: z.enum(['thousand', 'lakh', 'wan']).default('thousand'),
});

/**
 *
 */
/**
 * The default-customer resource is built HERE, and read one level down inside the boundary.
 *
 * Built in the component that also READS it, the resource would be discarded with the aborted
 * render and rebuilt by every Suspense retry, which never ends (#1707): the customers query's
 * first emission is always async, and `AreaPage`'s boundary sits ABOVE this component, so
 * it cannot help. Above a boundary of its own, this component commits alongside the fallback
 * and the retry reads back the resource the first attempt already subscribed.
 */
export function GeneralSettings() {
	const { defaultCustomerResource } = useDefaultCustomer();

	return (
		<Suspense>
			<CountriesProvider>
				<SavedFieldProvider>
					<GeneralSettingsForm defaultCustomerResource={defaultCustomerResource} />
				</SavedFieldProvider>
			</CountriesProvider>
		</Suspense>
	);
}

function GeneralSettingsForm({
	defaultCustomerResource,
}: {
	defaultCustomerResource: ReturnType<typeof useDefaultCustomer>['defaultCustomerResource'];
}) {
	const { store, site } = useStoreSession();
	const sep = useDocField(store, (value) => value.price_thousand_sep);
	const thousandsStyles = React.useMemo(
		() => [
			{ value: 'thousand', label: ['123', '456', '789'].join(sep) },
			{ value: 'lakh', label: ['12', '34', '56', '789'].join(sep) },
			{ value: 'wan', label: ['1', '2345', '6789'].join(sep) },
		],
		[sep]
	);
	const countries = useCountries();
	const markSaved = useMarkSaved();
	const [restoreOpen, setRestoreOpen] = React.useState(false);
	const [restoreFailed, setRestoreFailed] = React.useState(false);
	const formData = useDocField(store, (latest) => {
		return {
			name: latest.name,
			store_country: latest.store_country,
			store_state: latest.store_state,
			store_city: latest.store_city,
			store_postcode: latest.store_postcode,
			locale: latest.locale,
			default_customer: latest.default_customer,
			default_customer_is_cashier: latest.default_customer_is_cashier,
			currency: latest.currency,
			currency_pos: latest.currency_pos,
			price_thousand_sep: latest.price_thousand_sep,
			price_decimal_sep: latest.price_decimal_sep,
			price_num_decimals: latest.price_num_decimals,
			thousands_group_style: latest.thousands_group_style,
		};
	});
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	// The resource emits an engine record for a configured customer (guest is plain data);
	// the name formatter takes the WIRE shape, so unwrap the payload before formatting.
	const defaultCustomerData =
		'getLatest' in defaultCustomer ? defaultCustomer.getLatest().payload : defaultCustomer;
	const t = useT();
	const { currencyPositions } = useOptionLists();
	const { format } = useCustomerNameFormat();
	const [loading, setLoading] = React.useState(false);
	const http = useRestHttpClient();
	// Set in WooCommerce (property rows rule 6): the base address's rows link to its settings.
	const wooUrl = site.url && `${site.url.replace(/\/+$/, '')}/wp-admin/admin.php?page=wc-settings`;
	const woo = { where: t('settings.set_in_woocommerce'), href: wooUrl || undefined };

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 * Also fixes the double-reset issue on first load.
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema as never) as never,
		values: formData,
	});

	/**
	 * Handle form changes and persist to store
	 */
	const handleChange = React.useCallback(
		async ({
			store_country,
			store_state,
			store_city,
			store_postcode,
			...changes
		}: Partial<z.infer<typeof formSchema>>) => {
			// Only a genuine change is acknowledged (see `savedKeys`), and only when the patch applied:
			// `patchStoreSettings` logs and toasts a failed write and resolves undefined.
			const keys = savedKeys(store.getLatest?.() ?? store, changes);
			const result = await patchStoreSettings(store, changes, t);
			if (result && keys.length > 0) markSaved(keys);
		},
		[t, store, markSaved]
	);

	useFormChangeHandler({
		form: form as never,
		onChange: handleChange as never,
	});

	/**
	 * Toggle customer select
	 */
	const toggleCustomerSelect = useWatch({
		control: form.control,
		name: 'default_customer_is_cashier',
	});

	/**
	 * Restore server settings
	 */
	const handleRestoreServerSettings = React.useCallback(async () => {
		setRestoreOpen(false);
		setRestoreFailed(false);
		setLoading(true);
		try {
			const response = await http.get(`stores/${store.id}`);
			const data = response.data;
			const patch = getServerOwnedStorePatch(
				store.getLatest() as unknown as Record<string, unknown>,
				data,
				SERVER_OWNED_STORE_FIELDS
			);
			if (Object.keys(patch).length > 0) {
				const result = await patchStoreSettings(store, patch, t);
				if (!result) throw new Error('Restore: the local patch did not apply');
			}
			markSaved(['restore']);
		} catch (error) {
			setRestoreFailed(true);
			// The inline line below shows the failure with its own Try again: the row
			// carries the code of what the store answered (offline: SYNC121), no toast.
			reportRestoreFailure(uiLogger, error, t, { toast: false });
		} finally {
			setLoading(false);
		}
	}, [http, t, store, markSaved]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-5">
				<FormErrors />
				<SettingsSection first title={t('settings.store')}>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<PropertyRow name="name" label={t('settings.store_name')}>
								<FormInput testID="settings-general-name" {...field} />
							</PropertyRow>
						)}
					/>
					<PropertyRow
						label={t('settings.store_base_country')}
						locked={woo}
						testID="settings-general-locked-country"
					>
						{decode(countries.find(({ code }) => code === formData.store_country)?.name ?? '')}
					</PropertyRow>
					<PropertyRow
						label={t('settings.store_base_state')}
						locked={woo}
						testID="settings-general-locked-state"
					>
						{decode(
							countries
								.find(({ code }) => code === formData.store_country)
								?.states?.find(({ code }) => code === formData.store_state)?.name ??
								formData.store_state ??
								''
						)}
					</PropertyRow>
					<PropertyRow
						label={t('settings.store_base_city')}
						locked={woo}
						testID="settings-general-locked-city"
					>
						{formData.store_city}
					</PropertyRow>
					<PropertyRow
						label={t('settings.store_base_postcode')}
						locked={woo}
						testID="settings-general-locked-postcode"
					>
						{formData.store_postcode}
					</PropertyRow>
				</SettingsSection>

				<SettingsSection title={t('settings.localization')}>
					<FormField
						control={form.control}
						name="locale"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow name="locale" label={t('settings.language')}>
								<FormSelect
									customComponent={LanguageSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="default_customer"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow
								name="default_customer"
								label={t('settings.default_customer')}
								help={t('settings.default_customer_description')}
							>
								<FormCombobox
									customComponent={CustomerSelect}
									onChange={onChange}
									{...rest}
									withGuest
									// The field holds a customer id; its label comes from the resolved
									// customer, so the pair is passed through rather than derived.
									value={{ value: String(value), label: format(defaultCustomerData) }}
									disabled={toggleCustomerSelect}
								/>
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="default_customer_is_cashier"
						render={({ field }) => (
							<PropertyRow
								name="default_customer_is_cashier"
								label={t('settings.default_customer_is_cashier')}
								control={<FormSwitch {...field} />}
							/>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('settings.currency_and_numbers')}>
					<FormField
						control={form.control}
						name="currency"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow name="currency" label={t('common.currency')}>
								<FormSelect
									customComponent={CurrencySelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="currency_pos"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow name="currency_pos" label={t('settings.currency_position')}>
								<FormSelect
									options={currencyPositions}
									placeholder={t('common.select_a_currency_position')}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_decimal_sep"
						render={({ field }) => (
							<PropertyRow name="price_decimal_sep" label={t('settings.decimal_separator')}>
								<FormInput {...field} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field }) => (
							<PropertyRow name="price_num_decimals" label={t('settings.number_of_decimals')}>
								<FormAmountField kind="count" testID="settings-general-decimals" {...field} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<PropertyRow name="price_thousand_sep" label={t('settings.thousand_separator')}>
								<FormInput {...field} />
							</PropertyRow>
						)}
					/>
					<FormField
						control={form.control}
						name="thousands_group_style"
						render={({ field: { value, onChange, ...rest } }) => (
							<PropertyRow name="thousands_group_style" label={t('settings.thousands_group_style')}>
								<FormSelect
									options={thousandsStyles}
									placeholder={t('common.select_thousands_style')}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</PropertyRow>
						)}
					/>
				</SettingsSection>

				<SettingsDangerZone
					description={t('settings.restore_server_settings_line')}
					buttonLabel={t('settings.restore_server_settings')}
					onPress={() => setRestoreOpen(true)}
					loading={loading}
					testID="settings-general-restore-server"
				/>
				<SavedMark name="restore" label={t('settings.restored')} />
				{restoreFailed && (
					<VStack>
						<Text variant="help">{t('settings.restore_failed')}</Text>
						{/* Try again after a refusal is the one action this line exists for. */}
						<Button testID="settings-general-restore-retry" onPress={() => setRestoreOpen(true)}>
							{t('settings.try_again')}
						</Button>
					</VStack>
				)}
				{/* The device's repair tool, beside the store's: it left the cashier sheet on 2026-10-23. */}
				<ClearLocalData
					trigger={(onPress) => (
						<SettingsDangerZone
							description={t('common.clear_all_local_data_body')}
							buttonLabel={t('common.clear_all_local_data')}
							onPress={onPress}
							testID="settings-general-clear-local-data"
						/>
					)}
				/>
				<Alert.AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
					<Alert.AlertDialogContent>
						<Alert.AlertDialogHeader>
							<Alert.AlertDialogTitle>{t('settings.restore_confirm_title')}</Alert.AlertDialogTitle>
							<Alert.AlertDialogDescription>
								{t('settings.restore_server_settings_description')}
							</Alert.AlertDialogDescription>
						</Alert.AlertDialogHeader>
						<Alert.AlertDialogFooter
							cancel={{ testID: 'settings-general-restore-cancel' }}
							confirm={{
								label: t('settings.restore_server_settings'),
								destructive: true,
								testID: 'settings-general-restore-confirm',
								onPress: () => void handleRestoreServerSettings(),
							}}
						/>
					</Alert.AlertDialogContent>
				</Alert.AlertDialog>
			</VStack>
		</Form>
	);
}
