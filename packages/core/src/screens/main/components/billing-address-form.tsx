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
							<FormInput label={t('common.first_name')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.last_name"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.last_name')} {...field} />
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
							<FormInput label={t('common.email')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.phone"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.phone')} {...field} />
						</View>
					)}
				/>
			</HStack>
			<FormField
				control={control}
				name="billing.company"
				render={({ field }) => <FormInput label={t('common.company')} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.address_1"
				render={({ field }) => <FormInput label={t('common.address_1')} {...field} />}
			/>
			<FormField
				control={control}
				name="billing.address_2"
				render={({ field }) => <FormInput label={t('common.address_2')} {...field} />}
			/>
			<HStack className="gap-4">
				<FormField
					control={control}
					name="billing.city"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.city')} {...field} />
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
								label={t('common.state')}
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
							<FormCombobox
								customComponent={CountryCombobox}
								label={t('common.country')}
								{...field}
							/>
						</View>
					)}
				/>
				<FormField
					control={control}
					name="billing.postcode"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.postcode')} {...field} />
						</View>
					)}
				/>
			</HStack>
		</VStack>
	);
};
