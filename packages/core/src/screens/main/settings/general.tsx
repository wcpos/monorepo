import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableSuspense } from 'observable-hooks';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { isExpectedPreflightBlock } from '@wcpos/hooks/use-http-client/is-expected-preflight-block';
import { Suspense } from '@wcpos/components/suspense';
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

import { SettingsDangerZone } from './components/settings-danger-zone';
import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { getServerOwnedStorePatch } from '../../../utils/merge-stores';
import { CountryCombobox } from '../components/country-state-select/country-combobox';
import { StateFormInput } from '../components/country-state-select/state-forminput';
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
	const { store } = useStoreSession();
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
	 * Toggle customer select
	 */
	const toggleCustomerSelect = useWatch({
		control: form.control,
		name: 'default_customer_is_cashier',
	});

	/**
	 * Get country code
	 */
	const countryCode = useWatch({
		control: form.control,
		name: 'store_country',
		defaultValue: form.getValues('store_country'),
	});

	/**
	 * Restore server settings
	 */
	const handleRestoreServerSettings = React.useCallback(async () => {
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
				await localPatch({ document: store, data: patch as never });
			}
		} catch (error) {
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
	}, [http, localPatch, store]);

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
							<SettingsRow label={t('settings.store_name')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						name="store_country"
						render={({ field }) => (
							<SettingsRow label={t('settings.store_base_country')}>
								<FormCombobox customComponent={CountryCombobox} {...field} disabled />
							</SettingsRow>
						)}
					/>
					<FormField
						name="store_state"
						render={({ field }) => (
							<SettingsRow label={t('settings.store_base_state')}>
								<FormInput
									customComponent={StateFormInput}
									{...field}
									{...({ countryCode } as Record<string, unknown>)}
									disabled
								/>
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="store_city"
						render={({ field }) => (
							<SettingsRow label={t('settings.store_base_city')}>
								<FormInput {...field} disabled />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="store_postcode"
						render={({ field }) => (
							<SettingsRow label={t('settings.store_base_postcode')}>
								<FormInput {...field} disabled />
							</SettingsRow>
						)}
					/>
				</SettingsSection>

				<SettingsSection title={t('settings.localization')}>
					<FormField
						control={form.control}
						name="locale"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow label={t('settings.language')}>
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
							<SettingsRow inline label={t('settings.default_customer_is_cashier')}>
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
							<SettingsRow label={t('common.currency')}>
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
							<SettingsRow label={t('settings.currency_position')}>
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
							<SettingsRow label={t('settings.decimal_separator')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field: { value, ...rest } }) => (
							<SettingsRow label={t('settings.number_of_decimals')}>
								<FormInput type="numeric" value={value ?? undefined} {...rest} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<SettingsRow label={t('settings.thousand_separator')}>
								<FormInput {...field} />
							</SettingsRow>
						)}
					/>
					<FormField
						control={form.control}
						name="thousands_group_style"
						render={({ field: { value, onChange, ...rest } }) => (
							<SettingsRow label={t('settings.thousands_group_style')}>
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
					onPress={handleRestoreServerSettings}
					loading={loading}
					testID="settings-general-restore-server"
				/>
			</VStack>
		</Form>
	);
}
