import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { decode } from 'html-entities';
import { useObservableSuspense } from 'observable-hooks';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { SERVER_OWNED_STORE_FIELDS } from '@wcpos/database/collections/schemas/stores';
import { useDocField } from '@wcpos/query';

import { LockedRow } from './components/locked-row';
import { SavedMark, useMarkSaved } from './components/saved-mark';
import { SettingsDangerZone } from './components/settings-danger-zone';
import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import allCountries from '../../../contexts/countries/countries.json';
import { useT } from '../../../contexts/translations';
import { getServerOwnedStorePatch } from '../../../utils/merge-stores';
import { CurrencyPositionSelect } from '../components/currency-position-select';
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { FormErrors } from '../components/form-errors';
import { LanguageSelect } from '../components/language-select';
import { ThousandsStyleSelect } from '../components/thousands-style-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format';
import { useDefaultCustomer } from '../hooks/use-default-customer';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const uiLogger = getLogger(['wcpos', 'ui', 'settings']);

/** Set in WooCommerce and mirrored here: kept in the form, never written by it. */
const LOCKED_STORE_FIELDS: readonly string[] = [
	'store_country',
	'store_state',
	'store_city',
	'store_postcode',
];
const orDash = (value?: string) => value || '—';

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
	default_customer: z.number().default(0),
	default_customer_is_cashier: z.boolean().default(false),
	currency: z.string().default('USD'),
	currency_pos: z.string().default('left'),
	price_thousand_sep: z.string().default(','),
	price_decimal_sep: z.string().default('.'),
	price_num_decimals: z.number().default(2),
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
 * first emission is always async, and `SettingsPage`'s boundary sits ABOVE this component, so
 * it cannot help. Above a boundary of its own, this component commits alongside the fallback
 * and the retry reads back the resource the first attempt already subscribed.
 */
export function GeneralSettings() {
	const { defaultCustomerResource } = useDefaultCustomer();

	return (
		<Suspense>
			<GeneralSettingsForm defaultCustomerResource={defaultCustomerResource} />
		</Suspense>
	);
}

function GeneralSettingsForm({
	defaultCustomerResource,
}: {
	defaultCustomerResource: ReturnType<typeof useDefaultCustomer>['defaultCustomerResource'];
}) {
	const { store, site } = useStoreSession();
	const markSaved = useMarkSaved();
	const [confirmRestore, setConfirmRestore] = React.useState(false);
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
	const { localPatch } = useLocalMutation();
	const { format } = useCustomerNameFormat();
	const [loading, setLoading] = React.useState(false);
	const http = useRestHttpClient();

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
	 * Handle form changes and persist to store. The four address fields are set in
	 * WooCommerce and mirrored here, so a change never writes them.
	 */
	const handleChange = React.useCallback(
		async (data: Partial<z.infer<typeof formSchema>>) => {
			const patch = Object.fromEntries(
				Object.entries(data).filter(([key]) => !LOCKED_STORE_FIELDS.includes(key))
			);
			await localPatch({ document: store, data: patch });
			markSaved(Object.keys(patch));
		},
		[localPatch, markSaved, store]
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

	const country = allCountries.find((option) => option.code === formData.store_country);
	const stateName = country?.states.find((state) => state.code === formData.store_state)?.name;
	// `url` is optional on the site schema; a site without one gets no link, not a crash.
	const siteUrl = typeof site.url === 'string' ? site.url.replace(/\/+$/, '') : '';
	const wooSettingsUrl = siteUrl ? `${siteUrl}/wp-admin/admin.php?page=wc-settings` : '';

	/**
	 * Restore server settings, after the confirm; the result shows at its row.
	 */
	const handleRestoreServerSettings = React.useCallback(async () => {
		setLoading(true);
		setRestoreFailed(false);
		try {
			const response = await http.get(`stores/${store.id}`);
			const data = response.data;
			const patch = getServerOwnedStorePatch(
				store.getLatest() as unknown as Record<string, unknown>,
				data,
				SERVER_OWNED_STORE_FIELDS
			);
			if (Object.keys(patch).length > 0) {
				await localPatch({ document: store, data: patch as never });
			}
			markSaved('restore');
		} catch (error) {
			setRestoreFailed(true);
			const logLevel = isExpectedPreflightBlock(error) ? 'warn' : 'error';
			uiLogger[logLevel]('Failed to restore server settings', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: {
					error: getErrorMessage(error),
				},
			});
		} finally {
			setLoading(false);
		}
	}, [http, localPatch, markSaved, store]);

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
							<SettingsRow name="name" label={t('settings.store_name')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<LockedRow
						label={t('settings.store_base_country')}
						value={country ? decode(country.name) : orDash(formData.store_country)}
						testID="settings-general-locked-country"
					/>
					<LockedRow
						label={t('settings.store_base_state')}
						value={orDash(stateName ? decode(stateName) : formData.store_state)}
						testID="settings-general-locked-state"
					/>
					<LockedRow
						label={t('settings.store_base_city')}
						value={orDash(formData.store_city)}
						testID="settings-general-locked-city"
					/>
					<LockedRow
						label={t('settings.store_base_postcode')}
						value={orDash(formData.store_postcode)}
						testID="settings-general-locked-postcode"
					/>
					<Text className="text-muted-foreground text-xs">{t('settings.tax_locked_note')}</Text>
					{wooSettingsUrl ? (
						<DocsLink href={wooSettingsUrl}>{t('settings.store_locked_link')}</DocsLink>
					) : null}
				</SettingsSection>

				<SettingsSection title={t('settings.localization')}>
					<FormField
						control={form.control}
						name="locale"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow name="locale" label={t('settings.language')}>
								<FormSelect
									customComponent={LanguageSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="default_customer"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow
								name="default_customer"
								label={t('settings.default_customer')}
								description={t('settings.default_customer_description')}
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
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="default_customer_is_cashier"
						render={({ field }) => (
							<SettingsRow
								inline
								name="default_customer_is_cashier"
								label={t('settings.default_customer_is_cashier')}
							>
								<FormSwitch {...field} />
							</SettingsRow>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('settings.currency_and_numbers')}>
					<FormField
						control={form.control}
						name="currency"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow name="currency" label={t('common.currency')}>
								<FormCombobox
									customComponent={CurrencySelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="currency_pos"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow name="currency_pos" label={t('settings.currency_position')}>
								<FormSelect
									customComponent={CurrencyPositionSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_decimal_sep"
						render={({ field }) => (
							<SettingsRow name="price_decimal_sep" label={t('settings.decimal_separator')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field: { value, ...rest } }) => (
							<SettingsRow name="price_num_decimals" label={t('settings.number_of_decimals')}>
								<FormInput type="numeric" value={value ?? undefined} {...rest} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<SettingsRow name="price_thousand_sep" label={t('settings.thousand_separator')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="thousands_group_style"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow name="thousands_group_style" label={t('settings.thousands_group_style')}>
								<FormSelect
									customComponent={ThousandsStyleSelect}
									value={value}
									onChange={onChange}
									{...rest}
								/>
							</SettingsRow>
						)}
					/>
				</SettingsSection>

				<SettingsDangerZone
					description={t('settings.restore_server_settings_description')}
					buttonLabel={t('settings.restore_server_settings')}
					onPress={() => setConfirmRestore(true)}
					loading={loading}
					testID="settings-general-restore-server"
					status={
						restoreFailed ? (
							<HStack className="items-center gap-1">
								<Text className="text-destructive text-xs">{t('settings.restore_failed')}</Text>
								<Button
									variant="link"
									size="sm"
									onPress={handleRestoreServerSettings}
									testID="settings-general-restore-retry"
								>
									<Text>{t('settings.try_again')}</Text>
								</Button>
							</HStack>
						) : (
							<SavedMark name="restore" label={t('settings.restored')} />
						)
					}
				/>
				<AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('settings.restore_confirm_title')}</AlertDialogTitle>
							<AlertDialogDescription>
								{t('settings.restore_server_settings_description')}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel testID="settings-general-restore-cancel">
								{t('common.cancel')}
							</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								testID="settings-general-restore-confirm"
								onPress={() => {
									setConfirmRestore(false);
									void handleRestoreServerSettings();
								}}
							>
								{t('settings.restore_server_settings')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</VStack>
		</Form>
	);
}
