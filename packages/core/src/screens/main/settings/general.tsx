import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState, useObservableSuspense } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@wcpos/components/button';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { CountryCombobox } from '../components/country-state-select/country-combobox';
import { StateFormInput } from '../components/country-state-select/state-forminput';
import { CurrencyPositionSelect } from '../components/currency-position-select';
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { FormErrors } from '../components/form-errors';
import { LanguageSelect } from '../components/language-select';
import { ThousandsStyleSelect } from '../components/thousands-style-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../hooks/use-customer-name-format';
import { useDefaultCustomer } from '../hooks/use-default-customer';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

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
export const GeneralSettings = () => {
	const { store } = useAppState();
	const formData = useObservablePickState(
		store.$,
		() => {
			const latest = store.getLatest();
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
		},
		'name',
		'store_country',
		'store_state',
		'store_city',
		'store_postcode',
		'locale',
		'default_customer',
		'default_customer_is_cashier',
		'currency',
		'currency_pos',
		'price_thousand_sep',
		'price_decimal_sep',
		'price_num_decimals',
		'thousands_group_style'
	);
	const { defaultCustomerResource } = useDefaultCustomer();
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
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
	 * Toggle customer select
	 */
	const toggleCustomerSelect = form.watch('default_customer_is_cashier');

	/**
	 * Get country code
	 */
	const countryCode = form.watch('store_country', form.getValues('store_country'));

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
					name: data.name,
					store_country: data.store_country,
					store_state: data.store_state,
					store_city: data.store_city,
					store_postcode: data.store_postcode,
					locale: data.locale,
					default_customer: data.default_customer,
					default_customer_is_cashier: data.default_customer_is_cashier,
					currency: data.currency,
					currency_pos: data.currency_pos,
					price_thousand_sep: data.price_thousand_sep,
					price_decimal_sep: data.price_decimal_sep,
					price_num_decimals: data.price_num_decimals,
					// thousands_group_style: data.thousands_group_style,
				},
			});
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	}, [http, localPatch, store]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => <FormInput label={t('settings.store_name')} {...field} />}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="store_city"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('settings.store_base_city')} {...field} disabled />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="store_postcode"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('settings.store_base_postcode')} {...field} disabled />
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						name="store_state"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									customComponent={StateFormInput}
									label={t('settings.store_base_state')}
									{...field}
									countryCode={countryCode}
									disabled
								/>
							</View>
						)}
					/>
					<FormField
						name="store_country"
						render={({ field }) => (
							<View className="flex-1">
								<FormCombobox
									customComponent={CountryCombobox}
									label={t('settings.store_base_country')}
									{...field}
									disabled
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="locale"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={LanguageSelect}
									label={t('settings.language')}
									{...field}
								/>
							</View>
						)}
					/>
					<VStack className="flex-1">
						<FormField
							control={form.control}
							name="default_customer"
							render={({ field }) => (
								<FormCombobox
									customComponent={CustomerSelect}
									label={t('settings.default_customer')}
									withGuest
									{...field}
									// override value with defaultCustomer
									value={{ value: field.value, label: format(defaultCustomer) }}
									disabled={toggleCustomerSelect}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="default_customer_is_cashier"
							render={({ field }) => (
								<FormSwitch label={t('settings.default_customer_is_cashier')} {...field} />
							)}
						/>
					</VStack>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="currency"
						render={({ field }) => (
							<View className="flex-1">
								<FormCombobox
									customComponent={CurrencySelect}
									label={t('common.currency')}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="currency_pos"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									customComponent={CurrencyPositionSelect}
									label={t('settings.currency_position')}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="price_decimal_sep"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('settings.decimal_separator')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('settings.number_of_decimals')} type="numeric" {...field} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('settings.thousand_separator')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="thousands_group_style"
						render={({ field }) => (
							<View className="flex-1">
								<FormSelect
									label={t('settings.thousands_group_style')}
									customComponent={ThousandsStyleSelect}
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<ModalFooter className="px-0">
					<Button variant="destructive" onPress={handleRestoreServerSettings} loading={loading}>
						{t('settings.restore_server_settings')}
					</Button>
					<ModalClose>{t('common.close')}</ModalClose>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
