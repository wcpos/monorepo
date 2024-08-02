import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, FormSwitch } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import { CountrySelect, StateSelect } from '../../components/country-state-select';

export interface CustomerFormValues {
	billing: {
		first_name?: string;
		last_name?: string;
		email?: string;
		phone?: string;
		company?: string;
		address_1?: string;
		address_2?: string;
		city?: string;
		state?: string;
		country?: string;
		postcode?: string;
	};
	shipping: {
		first_name?: string;
		last_name?: string;
		company?: string;
		address_1?: string;
		address_2?: string;
		city?: string;
		state?: string;
		country?: string;
		postcode?: string;
	};
	copyBillingToShipping: boolean;
}

export interface SubmitCustomerHandle {
	submit: () => void;
}

interface AddCustomerProps {
	onSubmit: (data: CustomerFormValues) => void;
}

/**
 *
 */
export const CustomerForm = React.forwardRef<SubmitCustomerHandle, AddCustomerProps>(
	({ onSubmit }, ref) => {
		const t = useT();

		/**
		 *
		 */
		const formSchema = React.useMemo(
			() =>
				z.object({
					billing: z.object({
						first_name: z.string().optional(),
						last_name: z.string().optional(),
						email: z.string().optional(),
						phone: z.string().optional(),
						company: z.string().optional(),
						address_1: z.string().optional(),
						address_2: z.string().optional(),
						city: z.string().optional(),
						state: z.string().optional(),
						country: z.string().optional(),
						postcode: z.string().optional(),
					}),
					shipping: z.object({
						first_name: z.string().optional(),
						last_name: z.string().optional(),
						company: z.string().optional(),
						address_1: z.string().optional(),
						address_2: z.string().optional(),
						city: z.string().optional(),
						state: z.string().optional(),
						country: z.string().optional(),
						postcode: z.string().optional(),
					}),
					copyBillingToShipping: z.boolean().optional(),
				}),
			[]
		);

		/**
		 *
		 */
		const form = useForm<z.infer<typeof formSchema>>({
			resolver: zodResolver(formSchema),
			defaultValues: {
				billing: {
					first_name: '',
					last_name: '',
					email: '',
					phone: '',
					company: '',
					address_1: '',
					address_2: '',
					city: '',
					state: '',
					country: '',
					postcode: '',
				},
				shipping: {
					first_name: '',
					last_name: '',
					company: '',
					address_1: '',
					address_2: '',
					city: '',
					state: '',
					country: '',
					postcode: '',
				},
				copyBillingToShipping: true,
			},
		});

		/**
		 *
		 */
		React.useImperativeHandle(ref, () => ({
			submit: () => form.handleSubmit(onSubmit)(),
		}));

		/**
		 *
		 */
		const toggleShipping = form.watch('copyBillingToShipping');

		/**
		 *
		 */
		return (
			<Form {...form}>
				<VStack>
					<Text className="text-lg font-bold">{t('Billing Address', { _tags: 'core' })}</Text>
					<View className="grid grid-cols-2 gap-4">
						<FormField
							control={form.control}
							name="billing.first_name"
							render={({ field }) => (
								<FormInput label={t('First Name', { _tags: 'core' })} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="billing.last_name"
							render={({ field }) => (
								<FormInput label={t('Last Name', { _tags: 'core' })} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="billing.email"
							render={({ field }) => <FormInput label={t('Email', { _tags: 'core' })} {...field} />}
						/>
						<FormField
							control={form.control}
							name="billing.phone"
							render={({ field }) => <FormInput label={t('Phone', { _tags: 'core' })} {...field} />}
						/>
						<View className="col-span-2">
							<FormField
								control={form.control}
								name="billing.address_1"
								render={({ field }) => (
									<FormInput label={t('Company', { _tags: 'core' })} {...field} />
								)}
							/>
						</View>
						<View className="col-span-2">
							<FormField
								control={form.control}
								name="billing.company"
								render={({ field }) => (
									<FormInput label={t('Address 1', { _tags: 'core' })} {...field} />
								)}
							/>
						</View>
						<View className="col-span-2">
							<FormField
								control={form.control}
								name="billing.address_1"
								render={({ field }) => (
									<FormInput label={t('Address 2', { _tags: 'core' })} {...field} />
								)}
							/>
						</View>
						<FormField
							control={form.control}
							name="billing.city"
							render={({ field }) => <FormInput label={t('City', { _tags: 'core' })} {...field} />}
						/>
						<FormField
							control={form.control}
							name="billing.state"
							render={({ field }) => <FormInput label={t('State', { _tags: 'core' })} {...field} />}
						/>
						<FormField
							control={form.control}
							name="billing.country"
							render={({ field }) => (
								<CountrySelect label={t('Country', { _tags: 'core' })} {...field} />
							)}
						/>
						<FormField
							control={form.control}
							name="billing.postcode"
							render={({ field }) => (
								<FormInput label={t('Postcode', { _tags: 'core' })} {...field} />
							)}
						/>
					</View>
					<HStack>
						<Text className="text-lg font-bold">{t('Shipping Address', { _tags: 'core' })}</Text>
						<FormField
							control={form.control}
							name="copyBillingToShipping"
							render={({ field }) => (
								<FormSwitch
									label={t('Copy Billing Address to Shipping Address', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
					</HStack>
					{!toggleShipping && (
						<View className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="shipping.first_name"
								render={({ field }) => (
									<FormInput label={t('First Name', { _tags: 'core' })} {...field} />
								)}
							/>
							<FormField
								control={form.control}
								name="shipping.last_name"
								render={({ field }) => (
									<FormInput label={t('Last Name', { _tags: 'core' })} {...field} />
								)}
							/>
							<FormField
								control={form.control}
								name="shipping.email"
								render={({ field }) => (
									<FormInput label={t('Email', { _tags: 'core' })} {...field} />
								)}
							/>
							<View className="col-span-2">
								<FormField
									control={form.control}
									name="shipping.address_1"
									render={({ field }) => (
										<FormInput label={t('Company', { _tags: 'core' })} {...field} />
									)}
								/>
							</View>
							<View className="col-span-2">
								<FormField
									control={form.control}
									name="shipping.company"
									render={({ field }) => (
										<FormInput label={t('Address 1', { _tags: 'core' })} {...field} />
									)}
								/>
							</View>
							<View className="col-span-2">
								<FormField
									control={form.control}
									name="shipping.address_1"
									render={({ field }) => (
										<FormInput label={t('Address 2', { _tags: 'core' })} {...field} />
									)}
								/>
							</View>
							<FormField
								control={form.control}
								name="shipping.city"
								render={({ field }) => (
									<FormInput label={t('City', { _tags: 'core' })} {...field} />
								)}
							/>
							<FormField
								control={form.control}
								name="shipping.state"
								render={({ field }) => (
									<FormInput label={t('State', { _tags: 'core' })} {...field} />
								)}
							/>
							<FormField
								control={form.control}
								name="shipping.country"
								render={({ field }) => (
									<FormInput label={t('Country', { _tags: 'core' })} {...field} />
								)}
							/>
							<FormField
								control={form.control}
								name="shipping.postcode"
								render={({ field }) => (
									<FormInput label={t('Postcode', { _tags: 'core' })} {...field} />
								)}
							/>
						</View>
					)}
				</VStack>
			</Form>
		);
	}
);
