import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormSwitch } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../billing-address-form';
import { ShippingAddressForm, shippingAddressSchema } from '../shipping-address-form';

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
const formSchema = z.object({
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	copyBillingToShipping: z.boolean().optional(),
});

/**
 *
 */
export const CustomerForm = React.forwardRef<SubmitCustomerHandle, AddCustomerProps>(
	({ onSubmit }, ref) => {
		const t = useT();

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
					<BillingAddressForm />
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
					{!toggleShipping && <ShippingAddressForm />}
				</VStack>
			</Form>
		);
	}
);
