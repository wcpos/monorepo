import * as React from 'react';
import { View } from 'react-native';

import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@wcpos/components/src/collapsible';
import { Form, FormField, FormInput } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../billing-address-form';
import { FormErrors } from '../form-errors';
import { MetaDataForm, metaDataSchema } from '../meta-data-form';
import { ShippingAddressForm, shippingAddressSchema } from '../shipping-address-form';

/**
 *
 */
export const customerFormSchema = z.object({
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	email: z.string().email(),
	role: z.string().optional(),
	username: z.string().optional(),
	password: z.string().default(''), // WC REST API will error if password is not provided on create
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	meta_data: metaDataSchema,
});

/**
 *
 */
export const CustomerForm = ({ form, onClose, onSubmit, loading }) => {
	const t = useT();

	/**
	 *
	 */
	const handleCopyBillingToShipping = React.useCallback(() => {
		const billingAddress = form.getValues().billing;
		form.setValue('shipping', billingAddress);
	}, [form]);

	/**
	 * The username is editable on create, but not on edit.
	 */
	const hasUsername = !!form.getValues().username;

	/**
	 * Intercept handleSubmit to populate billing fields if empty.
	 */
	const handleSubmit = async (data: z.infer<typeof customerFormSchema>) => {
		// Create billing object if it doesn't exist
		if (!data.billing) {
			data.billing = {};
		}

		// Populate billing fields with top-level values if they are empty
		data.billing.first_name = data.billing.first_name || data.first_name || '';
		data.billing.last_name = data.billing.last_name || data.last_name || '';
		data.billing.email = data.billing.email || data.email || '';

		onSubmit(data);
	};

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<View className="grid grid-cols-2 gap-4">
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
						render={({ field }) => (
							<FormInput label={t('Last Name', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => <FormInput label={t('Email', { _tags: 'core' })} {...field} />}
					/>
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<FormInput
								label={t('Role', { _tags: 'core' })}
								{...field}
								editable={false} // role is not editable via the REST API, but maybe I should allow in the future?
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="username"
						render={({ field }) => (
							<FormInput
								label={t('Username', { _tags: 'core' })}
								{...field}
								editable={!hasUsername}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormInput label={t('Password', { _tags: 'core' })} {...field} />
						)}
					/>
				</View>
				<Collapsible>
					<CollapsibleTrigger>
						<Text>{t('Billing Address', { _tags: 'core' })}</Text>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<BillingAddressForm />
					</CollapsibleContent>
				</Collapsible>
				<Collapsible>
					<HStack>
						<CollapsibleTrigger>
							<Text>{t('Shipping Address', { _tags: 'core' })}</Text>
						</CollapsibleTrigger>
					</HStack>
					<CollapsibleContent>
						<VStack className="gap-4">
							<Button variant="muted" onPress={handleCopyBillingToShipping}>
								<ButtonText>
									{t('Copy billing address to shipping address', { _tags: 'core' })}
								</ButtonText>
							</Button>
							<ShippingAddressForm />
						</VStack>
					</CollapsibleContent>
				</Collapsible>
				<MetaDataForm />
				{/** TODO: move the buttons to the parent component */}
				<HStack className="justify-end">
					<Button variant="outline" onPress={onClose}>
						<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button loading={loading} onPress={form.handleSubmit(handleSubmit)}>
						<ButtonText>{t('Save')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
