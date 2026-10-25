import * as React from 'react';
import { View } from 'react-native';

import { useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { AddressCountryField, AddressStateField } from './billing-address-form';
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
			phone: z.string().optional(),
		})
		.optional(),
});

/**
 *
 */
export function ShippingAddressForm() {
	const { control } = useFormContext();
	const t = useT();

	return (
		<VStack className="gap-4">
			<HStack className="gap-4">
				<FormField
					control={control}
					name="shipping.first_name"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.first_name')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="shipping.last_name"
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
					name="shipping.company"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.company')} {...field} />
						</View>
					)}
				/>
				<FormField
					control={control}
					name="shipping.phone"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.phone')} {...field} />
						</View>
					)}
				/>
			</HStack>
			<FormField
				control={control}
				name="shipping.address_1"
				render={({ field }) => <FormInput label={t('common.address_1')} {...field} />}
			/>

			<FormField
				control={control}
				name="shipping.address_2"
				render={({ field }) => <FormInput label={t('common.address_2')} {...field} />}
			/>
			<HStack className="gap-4">
				<FormField
					control={control}
					name="shipping.city"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.city')} {...field} />
						</View>
					)}
				/>
				<View className="flex-1">
					<AddressStateField prefix="shipping" label={t('common.state')} />
				</View>
			</HStack>
			<HStack className="gap-4">
				<View className="flex-1">
					<AddressCountryField prefix="shipping" label={t('common.country')} />
				</View>
				<FormField
					control={control}
					name="shipping.postcode"
					render={({ field }) => (
						<View className="flex-1">
							<FormInput label={t('common.postcode')} {...field} />
						</View>
					)}
				/>
			</HStack>
		</VStack>
	);
}
