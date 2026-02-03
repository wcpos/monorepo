import * as React from 'react';
import { View } from 'react-native';

import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Form, FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

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
	 * We can check whether the customer has an ID to determine if we are on an edit.
	 */
	const hasUsername = !!form.getValues().id;

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
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSubmit);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="first_name"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('First Name')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="last_name"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Last Name')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Email')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Role')} {...field} editable={false} />
							</View>
						)}
					/>
				</HStack>
				<HStack className="w-full items-stretch gap-4">
					<FormField
						control={form.control}
						name="username"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Username')} {...field} editable={!hasUsername} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Password')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<Collapsible>
					<CollapsibleTrigger>
						<Text>{t('Billing Address')}</Text>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<BillingAddressForm />
					</CollapsibleContent>
				</Collapsible>
				<Collapsible>
					<HStack>
						<CollapsibleTrigger>
							<Text>{t('Shipping Address')}</Text>
						</CollapsibleTrigger>
					</HStack>
					<CollapsibleContent>
						<VStack className="gap-4">
							<Button variant="muted" onPress={handleCopyBillingToShipping}>
								<ButtonText>{t('Copy billing address to shipping address')}</ButtonText>
							</Button>
							<ShippingAddressForm />
						</VStack>
					</CollapsibleContent>
				</Collapsible>
				<MetaDataForm />
				{/** TODO: move the buttons to the parent component */}
				<HStack className="justify-end">
					<Button variant="outline" onPress={onClose}>
						<ButtonText>{t('Close')}</ButtonText>
					</Button>
					<Button loading={loading} onPress={onSave}>
						<ButtonText>{t('Save')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
