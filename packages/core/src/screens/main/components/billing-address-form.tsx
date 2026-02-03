import * as React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { FormCombobox, FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { CountryCombobox } from './country-state-select/country-combobox';
import { StateFormInput } from './country-state-select/state-forminput';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const billingAddressSchema = z.object({
	billing: z
		.object({
			first_name: z.string().optional(),
			last_name: z.string().optional(),
			email: z.string().email().optional().or(z.literal('')),
			phone: z.string().optional(),
			company: z.string().optional(),
			address_1: z.string().optional(),
			address_2: z.string().optional(),
			city: z.string().optional(),
			state: z.string().optional(),
			country: z.string().optional(),
			postcode: z.string().optional(),
		})
		.optional(),
});

/**
 *
 */
export const BillingAddressForm = () => {
	const { control, watch, getValues } = useFormContext();
	const t = useT();

	const countryCode = watch('billing.country', getValues('billing.country'));

	/**
	 *
	 */
	return (
		<VStack className="gap-4">
			<HStack className="gap-4">
				<FormField
					control={control}
					name="billing.first_name"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('First Name')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.last_name"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('Last Name')} {...field} />
						</View>
					)}
				/>
			</HStack>
			<HStack className="gap-4">
				<FormField
					control={control}
					name="billing.email"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('Email')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.phone"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('Phone')} {...field} />
						</View>
					)}
				/>
			</HStack>
			<FormField
				control={control}
				name="billing.company"
				render={({ field }) => <FormInput label={t('Company')} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.address_1"
				render={({ field }) => <FormInput label={t('Address 1')} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.address_2"
				render={({ field }) => <FormInput label={t('Address 2')} {...field} />}
			/>
			<HStack className="gap-4">
				<FormField
					control={control}
					name="billing.city"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('City')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.state"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput
								customComponent={StateFormInput}
								label={t('State')}
								{...field}
								countryCode={countryCode}
							/>
						</View>
					)}
				/>
			</HStack>
			<HStack className="gap-4">
				<FormField
					control={control}
					name="billing.country"
					render={({ field }) => (
						<View className="flex-1">
							<FormCombobox customComponent={CountryCombobox} label={t('Country')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.postcode"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('Postcode')} {...field} />
						</View>
					)}
				/>
			</HStack>
		</VStack>
	);
};
