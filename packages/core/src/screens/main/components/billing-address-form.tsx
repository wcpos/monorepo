import * as React from 'react';

import { useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { FormCombobox, FormField, FormInput } from '@wcpos/components/form';

import { CountryCombobox } from './country-state-select/country-combobox';
import { StateFormInput } from './country-state-select/state-forminput';

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

type AddressPrefix = 'billing' | 'shipping';

/** An address's country: the combobox, labelled by its property row's key. */
export function AddressCountryField({ prefix }: { prefix: AddressPrefix }) {
	const { control } = useFormContext();
	return (
		<FormField
			control={control}
			name={`${prefix}.country`}
			render={({ field }) => <FormCombobox customComponent={CountryCombobox} {...field} />}
		/>
	);
}

/** An address's state: a combobox, a select or text by the country's state count (StateFormInput). */
export function AddressStateField({ prefix }: { prefix: AddressPrefix }) {
	const { control, watch, getValues } = useFormContext();
	const countryCode = watch(`${prefix}.country`, getValues(`${prefix}.country`));
	return (
		<FormField
			control={control}
			name={`${prefix}.state`}
			render={({ field }) => (
				<FormInput
					customComponent={StateFormInput}
					{...field}
					{...({ countryCode } as Record<string, unknown>)}
				/>
			)}
		/>
	);
}
