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
import { cn } from '@wcpos/components/src/lib/utils';
import {
	SelectTrigger,
	SelectContent,
	SelectItem,
	SelectValue,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { CurrencyPositionSelect } from '../components/currency-position-select';
import { CurrencySelect } from '../components/currency-select';
import { CustomerSelect } from '../components/customer-select';
import { LanguageSelect } from '../components/language-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useDefaultCustomer } from '../hooks/use-default-customer';

/**
 *
 */
const formSchema = z.object({
	name: z.string().optional(),
	locale: z.string().optional(),
	default_customer: z.string().optional(),
	default_customer_is_cashier: z.boolean().optional(),
	currency: z.string().optional(),
	currency_pos: z.string().optional(),
	price_thousand_sep: z.string().optional(),
	price_decimal_sep: z.string().optional(),
	price_num_decimals: z.number().optional(),
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
		}),
		'name',
		'locale',
		'default_customer',
		'default_customer_is_cashier',
		'currency',
		'currency_pos',
		'price_thousand_sep',
		'price_decimal_sep',
		'price_num_decimals'
	);
	const { defaultCustomerResource } = useDefaultCustomer();
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(customer) => {
			if (customer.id !== defaultCustomer.id) {
				localPatch({
					document: store,
					data: { default_customer: customer.id },
				});
			}
		},
		[defaultCustomer.id, localPatch, store]
	);

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
								{...field}
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
				<View className="col-span-2 grid grid-cols-3  gap-4">
					<FormField
						control={form.control}
						name="price_thousand_sep"
						render={({ field }) => (
							<FormInput label={t('Thousand Separator', { _tags: 'core' })} {...field} />
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
				</View>
			</View>
		</Form>
	);
};
