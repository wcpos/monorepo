import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from '@wcpos/components/src/collapsible';
import { Form, FormField, FormInput, FormSwitch } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { FormErrors } from '../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import usePushDocument from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

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
	copyBillingToShipping: z.boolean(),
});

interface Props {
	customer: import('@wcpos/database').CustomerDocument;
}

/**
 *
 */
export const EditCustomerForm = ({ customer }: Props) => {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { format } = useCustomerNameFormat();
	const navigation = useNavigation();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			...customer.toJSON(),
			copyBillingToShipping: true,
		},
	});

	/**
	 *
	 */
	const toggleShipping = form.watch('copyBillingToShipping');

	/**
	 * Save to server
	 *
	 * NOTE: There's an issue if we just patch the form changes, other changes such as customer or if the
	 * order has been reopened will be lost. We need to push the whole order object.
	 */
	const handleSave = React.useCallback(
		async (data) => {
			setLoading(true);
			try {
				await localPatch({
					document: customer,
					data,
				});
				await pushDocument(customer).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						Toast.show({
							type: 'success',
							text1: t('{name} saved', { _tags: 'core', name: format(savedDoc) }),
						});
					}
				});
			} catch (error) {
				Toast.show({
					type: 'error',
					text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, customer, pushDocument, t, format]
	);

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
						render={({ field }) => <FormInput label={t('Role', { _tags: 'core' })} {...field} />}
					/>
					<FormField
						control={form.control}
						name="username"
						render={({ field }) => (
							<FormInput label={t('Username', { _tags: 'core' })} {...field} />
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
				<Collapsible disabled={toggleShipping}>
					<HStack>
						<CollapsibleTrigger>
							<Text>{t('Shipping Address', { _tags: 'core' })}</Text>
						</CollapsibleTrigger>
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
					<CollapsibleContent>
						<ShippingAddressForm />
					</CollapsibleContent>
				</Collapsible>
				<MetaDataForm />
				<HStack className="justify-end">
					<Button variant="muted" onPress={() => navigation.dispatch(StackActions.pop(1))}>
						<ButtonText>{t('Cancel', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button loading={loading} onPress={form.handleSubmit(handleSave)}>
						<ButtonText>{t('Save')}</ButtonText>
					</Button>
				</HStack>
			</VStack>
		</Form>
	);
};
