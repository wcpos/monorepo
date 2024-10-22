import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState, useObservableSuspense } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@wcpos/components/src/button';
import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	FormSelect,
	FormCombobox,
	useFormChangeHandler,
} from '@wcpos/components/src/form';
import { ModalClose, ModalFooter } from '@wcpos/components/src/modal';
import { VStack } from '@wcpos/components/src/vstack';

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
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			...formData,
		},
	});

	/**
	 *
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
	 * Track formData changes and reset form
	 *
	 * @FIXME: this unnecessarily resets twice on first load
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

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
				<View className="grid grid-cols-2 gap-4">
					<View className="col-span-2">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormInput label={t('Store Name', { _tags: 'core' })} {...field} />
							)}
						/>
					</View>
					<FormField
						control={form.control}
						name="store_city"
						render={({ field }) => (
							<FormInput label={t('Store Base City', { _tags: 'core' })} {...field} disabled />
						)}
					/>
					<FormField
						control={form.control}
						name="store_postcode"
						render={({ field }) => (
							<FormInput label={t('Store Base Postcode', { _tags: 'core' })} {...field} disabled />
						)}
					/>
					<FormField
						name="store_state"
						render={({ field }) => (
							<FormInput
								customComponent={StateFormInput}
								label={t('Store Base State', { _tags: 'core' })}
								{...field}
								countryCode={countryCode}
								disabled
							/>
						)}
					/>
					<FormField
						name="store_country"
						render={({ field }) => (
							<FormCombobox
								customComponent={CountryCombobox}
								label={t('Store Base Country', { _tags: 'core' })}
								{...field}
								disabled
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="locale"
						render={({ field }) => (
							<FormSelect
								customComponent={LanguageSelect}
								label={t('Language', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<VStack>
						<FormField
							control={form.control}
							name="default_customer"
							render={({ field }) => (
								<FormCombobox
									customComponent={CustomerSelect}
									label={t('Default Customer', { _tags: 'core' })}
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
								<FormSwitch
									label={t('Default Customer is cashier', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
					</VStack>
					<FormField
						control={form.control}
						name="currency"
						render={({ field }) => (
							<FormCombobox
								customComponent={CurrencySelect}
								label={t('Currency', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="currency_pos"
						render={({ field }) => (
							<FormSelect
								customComponent={CurrencyPositionSelect}
								label={t('Currency Position', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="price_decimal_sep"
						render={({ field }) => (
							<FormInput label={t('Decimal Separator', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="price_num_decimals"
						render={({ field }) => (
							<FormInput
								label={t('Number of Decimals', { _tags: 'core' })}
								type="numeric"
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<FormInput label={t('Thousand Separator', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="thousands_group_style"
						render={({ field }) => (
							<FormSelect
								label={t('Thousands Group Style', { _tags: 'core' })}
								customComponent={ThousandsStyleSelect}
								{...field}
							/>
						)}
					/>
				</View>
				<ModalFooter className="px-0">
					<Button variant="destructive" onPress={handleRestoreServerSettings} loading={loading}>
						{t('Restore server settings', { _tags: 'core' })}
					</Button>
					<ModalClose>{t('Close', { _tags: 'core' })}</ModalClose>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
