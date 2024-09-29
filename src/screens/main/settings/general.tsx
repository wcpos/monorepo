import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState, useObservableSuspense } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	FormSelect,
	FormCombobox,
	useFormChangeHandler,
} from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { CurrencyPositionSelect } from '../components/currency-position-select';
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { LanguageSelect } from '../components/language-select';
import { ThousandsStyleSelect } from '../components/thousands-style-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../hooks/use-customer-name-format';
import { useDefaultCustomer } from '../hooks/use-default-customer';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
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
		() => ({
			name: store.name,
			locale: store.locale,
			default_customer: store.default_customer,
			default_customer_is_cashier: store.default_customer_is_cashier,
			currency: store.currency,
			currency_pos: store.currency_pos,
			price_thousand_sep: store.price_thousand_sep,
			price_decimal_sep: store.price_decimal_sep,
			price_num_decimals: store.price_num_decimals,
			thousands_group_style: store.thousands_group_style,
		}),
		'name',
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
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Toggle customer select
	 */
	const toggleCustomerSelect = form.watch('default_customer_is_cashier');

	/**
	 *
	 */
	return (
		<Form {...form}>
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
							<FormSwitch label={t('Default Customer is cashier', { _tags: 'core' })} {...field} />
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
						<FormInput label={t('Number of Decimals', { _tags: 'core' })} {...field} />
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
		</Form>
	);
};
