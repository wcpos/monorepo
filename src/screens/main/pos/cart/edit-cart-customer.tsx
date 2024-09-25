import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormSwitch } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { useAugmentedRef } from '@wcpos/components/src/lib/utils';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
const formSchema = z.object({
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	copyBillingToShipping: z.boolean().optional(),
});

/**
 * RxDocument .billing$ and .shipping$ emit Proxy(Object) which can't be used in react-hook-form
 */
export const EditCartCustomerForm = React.forwardRef((props, ref) => {
	const t = useT();
	const { currentOrder } = useCurrentOrder();
	const billingProxy = useObservableEagerState(currentOrder.billing$);
	const shippingProxy = useObservableEagerState(currentOrder.shipping$);
	const billing = React.useMemo(() => JSON.parse(JSON.stringify(billingProxy)), [billingProxy]);
	const shipping = React.useMemo(() => JSON.parse(JSON.stringify(shippingProxy)), [shippingProxy]);
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			billing,
			shipping,
			copyBillingToShipping: true,
		},
	});

	/**
	 *
	 */
	const toggleShipping = form.watch('copyBillingToShipping');

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		const data = form.getValues();
		form.reset({ billing, shipping, copyBillingToShipping: data.copyBillingToShipping });
	}, [billing, shipping, form]);

	/**
	 *
	 */
	const handleSaveToOrder = async () => {
		const data = form.getValues();
		await localPatch({
			document: currentOrder,
			data: {
				billing: data.billing,
				shipping: data.shipping,
			},
		});
	};

	/**
	 *
	 */
	const handleSaveToOrderAndToCustomer = async () => {
		await handleSaveToOrder();
		// save to server
	};

	/**
	 *
	 */
	const formRef = useAugmentedRef({
		ref,
		methods: {
			handleSaveToOrder,
			handleSaveToOrderAndToCustomer,
		},
	});

	/**
	 * Form doesn't have a ref? What else should I use?
	 */
	return (
		<Form {...form}>
			<VStack ref={formRef} className="gap-4">
				<VStack>
					<Text className="font-medium">{t('Billing Address', { _tags: 'core' })}</Text>
					<BillingAddressForm />
				</VStack>
				<VStack>
					<HStack>
						<Text className="font-medium">{t('Shipping Address', { _tags: 'core' })}</Text>
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
			</VStack>
		</Form>
	);
});
