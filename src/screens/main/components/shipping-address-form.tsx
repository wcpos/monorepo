import * as React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { FormField, FormInput, FormCombobox } from '@wcpos/components/src/form';

import { CountryCombobox } from './country-state-select/country-combobox';
import { StateFormInput } from './country-state-select/state-forminput';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const shippingAddressSchema = z.object({
	shipping: z
		.object({
			first_name: z.string().optional(),
			last_name: z.string().optional(),
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
export const ShippingAddressForm = () => {
	const { control, watch, getValues } = useFormContext();
	const t = useT();

	const countryCode = watch('shipping.country', getValues('shipping.country'));

	return (
		<View className="grid grid-cols-2 gap-4">
			<FormField
				control={control}
				name="shipping.first_name"
				render={({ field }) => <FormInput label={t('First Name', { _tags: 'core' })} {...field} />}
			/>
			<FormField
				control={control}
				name="shipping.last_name"
				render={({ field }) => <FormInput label={t('Last Name', { _tags: 'core' })} {...field} />}
			/>
			<View className="col-span-2">
				<FormField
					control={control}
					name="shipping.company"
					render={({ field }) => <FormInput label={t('Company', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<View className="col-span-2">
				<FormField
					control={control}
					name="shipping.address_1"
					render={({ field }) => <FormInput label={t('Address 1', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<View className="col-span-2">
				<FormField
					control={control}
					name="shipping.address_2"
					render={({ field }) => <FormInput label={t('Address 2', { _tags: 'core' })} {...field} />}
				/>
			</View>
			<FormField
				control={control}
				name="shipping.city"
				render={({ field }) => <FormInput label={t('City', { _tags: 'core' })} {...field} />}
			/>
			<FormField
				control={control}
				name="shipping.state"
				render={({ field }) => (
					<FormInput
						customComponent={StateFormInput}
						label={t('State', { _tags: 'core' })}
						{...field}
						countryCode={countryCode}
					/>
				)}
			/>
			<FormField
				control={control}
				name="shipping.country"
				render={({ field }) => (
					<FormCombobox
						customComponent={CountryCombobox}
						label={t('Country', { _tags: 'core' })}
						{...field}
					/>
				)}
			/>
			<FormField
				control={control}
				name="shipping.postcode"
				render={({ field }) => <FormInput label={t('Postcode', { _tags: 'core' })} {...field} />}
			/>
		</View>
	);
};
