import * as React from 'react';
import { View } from 'react-native';

import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Form, FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalBody, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../billing-address-form';
import { FormErrors } from '../form-errors';
import { MetaDataForm, metaDataSchema } from '../meta-data-form';
import { ShippingAddressForm, shippingAddressSchema } from '../shipping-address-form';
import { TaxIdsForm, taxIdsFormSchema } from './tax-ids-form';

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
	tax_id: z.string().optional(),
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	meta_data: metaDataSchema,
	tax_ids: taxIdsFormSchema,
});

/**
 *
 */
interface CustomerFormProps {
	form: ReturnType<typeof import('react-hook-form').useForm<z.infer<typeof customerFormSchema>>>;
	onClose: () => void;
	onSubmit: (data: z.infer<typeof customerFormSchema>) => void;
	loading: boolean;
	renderLayout?: (body: React.ReactNode, footer: React.ReactNode) => React.ReactNode;
}

export function CustomerForm(props: CustomerFormProps) {
	const { form, onClose, onSubmit, loading, renderLayout } = props;
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
	const hasUsername = !!(form.getValues() as Record<string, unknown>).id;

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
	const body = (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="first_name"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									testID="customer-first-name-input"
									label={t('common.first_name')}
									{...field}
									value={field.value ?? ''}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="last_name"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									testID="customer-last-name-input"
									label={t('common.last_name')}
									{...field}
									value={field.value ?? ''}
								/>
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
								<FormInput testID="customer-email-input" label={t('common.email')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('common.role')}
									{...field}
									value={field.value ?? ''}
									editable={false}
								/>
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
								<FormInput
									label={t('common.username')}
									{...field}
									value={field.value ?? ''}
									editable={!hasUsername}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('common.password')} {...field} />
							</View>
						)}
					/>
				</HStack>
				<Collapsible>
					<CollapsibleTrigger testID="customer-billing-address-toggle">
						<Text>{t('common.billing_address')}</Text>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<BillingAddressForm />
					</CollapsibleContent>
				</Collapsible>
				<Collapsible>
					<HStack>
						<CollapsibleTrigger>
							<Text>{t('common.shipping_address')}</Text>
						</CollapsibleTrigger>
					</HStack>
					<CollapsibleContent>
						<VStack className="gap-4">
							<Button variant="muted" onPress={handleCopyBillingToShipping}>
								<ButtonText>{t('common.copy_billing_address_to_shipping_address')}</ButtonText>
							</Button>
							<ShippingAddressForm />
						</VStack>
					</CollapsibleContent>
				</Collapsible>
				<TaxIdsForm />
				<MetaDataForm />
			</VStack>
		</Form>
	);
	// Siblings, not an HStack: the footer owns the row/column direction per breakpoint.
	const footer = (
		<>
			<Button testID="customer-form-close" variant="outline" onPress={onClose}>
				<ButtonText>{t('common.close')}</ButtonText>
			</Button>
			<Button testID="customer-form-save" loading={loading} onPress={onSave}>
				<ButtonText>{t('common.save')}</ButtonText>
			</Button>
		</>
	);

	if (renderLayout) return renderLayout(body, footer);
	return (
		<>
			<ModalBody>{body}</ModalBody>
			<ModalFooter>{footer}</ModalFooter>
		</>
	);
}
