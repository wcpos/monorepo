import * as React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { FormCombobox, FormField, FormInput, FormSelect } from '@wcpos/components/src/form';

import { CountryCombobox } from './country-combobox';
import { StateCombobox } from './state-combobox';
import { StateSelect } from './state-select';
import { useCountries, StatesProvider } from '../../../contexts/countries';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const billingAddressSchema = z.object({
	billing: z.object({
		first_name: z.string().optional(),
		last_name: z.string().optional(),
		email: z.string().email(),
		phone: z.string().optional(),
		company: z.string().optional(),
		address_1: z.string().optional(),
		address_2: z.string().optional(),
		city: z.string().optional(),
		state: z.string().optional(),
		country: z.string().optional(),
		postcode: z.string().optional(),
	}),
});

/**
 *
 */
export const BillingAddressForm = () => {
	const { control, watch, getValues } = useFormContext();
	const t = useT();
	const allCountries = useCountries();

	/**
	 *
	 */
	const country = watch('billing.country', getValues('billing.country'));
	const states = allCountries.find((c) => c.code === country)?.states || [];

	/**
	 *
	 */
	return (
		<View className="grid grid-cols-2 gap-4">
			<FormField
				control={control}
				name="billing.first_name"
				render={({ field }) => <FormInput label={t('First Name', { _tags: 'core' })} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.last_name"
				render={({ field }) => <FormInput label={t('Last Name', { _tags: 'core' })} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.email"
				render={({ field }) => <FormInput label={t('Email', { _tags: 'core' })} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.phone"
				render={({ field }) => <FormInput label={t('Phone', { _tags: 'core' })} {...field} />}
			/>
			<View className="col-span-2">
				<FormField
					control={control}
					name="billing.address_1"
					render={({ field }) => <FormInput label={t('Company', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<View className="col-span-2">
				<FormField
					control={control}
					name="billing.company"
					render={({ field }) => <FormInput label={t('Address 1', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<View className="col-span-2">
				<FormField
					control={control}
					name="billing.address_1"
					render={({ field }) => <FormInput label={t('Address 2', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<FormField
				control={control}
				name="billing.city"
				render={({ field }) => <FormInput label={t('City', { _tags: 'core' })} {...field} />}
			/>
			{states.length === 0 ? (
				<FormField
					control={control}
					name="billing.state"
					render={({ field }) => <FormInput label={t('State', { _tags: 'core' })} {...field} />}
				/>
			) : states.length > 10 ? (
				<FormField
					control={control}
					name="billing.state"
					render={({ field }) => (
						<FormCombobox
							customComponent={StateCombobox}
							label={t('Country', { _tags: 'core' })}
							{...field}
						/>
					)}
				/>
			) : (
				<FormField
					control={control}
					name="billing.state"
					render={({ field }) => (
						<StatesProvider countryCode={country}>
							<FormSelect
								customComponent={StateSelect}
								label={t('State', { _tags: 'core' })}
								{...field}
							/>
						</StatesProvider>
					)}
				/>
			)}
			<FormField
				control={control}
				name="billing.country"
				render={({ field }) => (
					<StatesProvider countryCode={country}>
						<FormCombobox
							customComponent={CountryCombobox}
							label={t('Country', { _tags: 'core' })}
							{...field}
						/>
					</StatesProvider>
				)}
			/>
			<FormField
				control={control}
				name="billing.postcode"
				render={({ field }) => <FormInput label={t('Postcode', { _tags: 'core' })} {...field} />}
			/>
		</View>
	);
};
