import * as React from 'react';
import { View } from 'react-native';

import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Form, FormField, FormInput, FormItem, FormLabel, SavedMark } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
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
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

/** Billing identity filled from the top-level fields when empty (ledger line 3); the creation screens apply it on submit. */
export function fillBillingFromIdentity(data: CustomerFormValues): CustomerFormValues {
	return {
		...data,
		billing: {
			...data.billing,
			first_name: data.billing?.first_name || data.first_name || '',
			last_name: data.billing?.last_name || data.last_name || '',
			email: data.billing?.email || data.email || '',
		},
	};
}

interface CustomerFormProps {
	form: ReturnType<typeof import('react-hook-form').useForm<z.infer<typeof customerFormSchema>>>;
	footer: React.ReactNode;
	renderLayout?: (body: React.ReactNode, footer: React.ReactNode) => React.ReactNode;
	/** The record's own actions (the edit modal's Delete, Sync), on the footer's left. */
	footerLeading?: React.ReactNode;
}

export function CustomerForm(props: CustomerFormProps) {
	const { form, footer, renderLayout, footerLeading } = props;
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
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.first_name')}</FormLabel>
									<SavedMark name="first_name" label={t('settings.saved')} />
								</HStack>
								<FormInput
									testID="customer-first-name-input"
									{...field}
									value={field.value ?? ''}
								/>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="last_name"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.last_name')}</FormLabel>
									<SavedMark name="last_name" label={t('settings.saved')} />
								</HStack>
								<FormInput testID="customer-last-name-input" {...field} value={field.value ?? ''} />
							</FormItem>
						)}
					/>
				</HStack>
				<HStack className="w-full gap-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.email')}</FormLabel>
									<SavedMark name="email" label={t('settings.saved')} />
								</HStack>
								<FormInput testID="customer-email-input" {...field} />
							</FormItem>
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
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.username')}</FormLabel>
									<SavedMark name="username" label={t('settings.saved')} />
								</HStack>
								<FormInput {...field} value={field.value ?? ''} editable={!hasUsername} />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormItem className="flex-1">
								<HStack className="justify-between">
									<FormLabel>{t('common.password')}</FormLabel>
									<SavedMark name="password" label={t('settings.saved')} />
								</HStack>
								<FormInput {...field} />
							</FormItem>
						)}
					/>
				</HStack>
				<Collapsible>
					<HStack className="justify-between">
						<CollapsibleTrigger testID="customer-billing-address-toggle">
							<Text>{t('common.billing_address')}</Text>
						</CollapsibleTrigger>
						<SavedMark name="billing" label={t('settings.saved')} />
					</HStack>
					<CollapsibleContent>
						<BillingAddressForm />
					</CollapsibleContent>
				</Collapsible>
				<Collapsible>
					<HStack className="justify-between">
						<CollapsibleTrigger>
							<Text>{t('common.shipping_address')}</Text>
						</CollapsibleTrigger>
						<SavedMark name="shipping" label={t('settings.saved')} />
					</HStack>
					<CollapsibleContent>
						<VStack className="gap-4">
							<Button variant="outline" onPress={handleCopyBillingToShipping}>
								<ButtonText>{t('common.copy_billing_address_to_shipping_address')}</ButtonText>
							</Button>
							<ShippingAddressForm />
						</VStack>
					</CollapsibleContent>
				</Collapsible>
				<HStack className="items-start justify-between">
					<VStack className="flex-1">
						<TaxIdsForm />
					</VStack>
					<SavedMark name="tax_ids" label={t('settings.saved')} />
				</HStack>
				<MetaDataForm />
			</VStack>
		</Form>
	);
	// With record actions, two wrapping groups: the record's on the left, the footer on the right.
	const footerContent = footerLeading ? (
		<>
			<View className="min-w-0 shrink flex-row flex-wrap gap-2">{footerLeading}</View>
			<View className="min-w-0 shrink flex-row flex-wrap gap-2">{footer}</View>
		</>
	) : (
		footer
	);

	if (renderLayout) return renderLayout(body, footerContent);
	return (
		<>
			<DialogBody>{body}</DialogBody>
			<DialogFooter className={footerLeading ? 'flex-wrap justify-between' : undefined}>
				{footerContent}
			</DialogFooter>
		</>
	);
}
