import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';

/**
 *
 */
const formSchema = z.object({
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	email: z.string().email(),
	role: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditCustomerForm = ({ defaultValues = {} }) => {
	const t = useT();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="first_name"
					render={({ field }) => (
						<FormInput label={t('First Name', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="last_name"
					render={({ field }) => <FormInput label={t('Last Name', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => <FormInput label={t('Email', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="role"
					render={({ field }) => <FormInput label={t('Role', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="username"
					render={({ field }) => <FormInput label={t('Username', { _tags: 'core' })} {...field} />}
				/>
				<FormField
					control={form.control}
					name="password"
					render={({ field }) => <FormInput label={t('Password', { _tags: 'core' })} {...field} />}
				/>
				<BillingAddressForm />
				<ShippingAddressForm />
				<MetaDataForm />
			</VStack>
		</Form>
	);
};
