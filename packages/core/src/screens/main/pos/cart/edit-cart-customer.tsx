import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DialogAction, DialogClose, DialogFooter, useRootContext } from '@wcpos/components/dialog';
import { Form } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { FormErrors } from '../../components/form-errors';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';
import { useCollection } from '../../hooks/use-collection';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
const formSchema = z.object({
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
});

/**
 * RxDocument .billing$ and .shipping$ emit Proxy(Object) which can't be used in react-hook-form
 */
export const EditCartCustomerForm = () => {
	const t = useT();
	const { currentOrder } = useCurrentOrder();
	const customerID = useObservableEagerState(currentOrder.customer_id$);
	const billingProxy = useObservableEagerState(currentOrder.billing$);
	const shippingProxy = useObservableEagerState(currentOrder.shipping$);
	const billing = React.useMemo(() => JSON.parse(JSON.stringify(billingProxy)), [billingProxy]);
	const shipping = React.useMemo(() => JSON.parse(JSON.stringify(shippingProxy)), [shippingProxy]);
	const { localPatch } = useLocalMutation();
	const { patch } = useMutation({ collectionName: 'customers' });
	const { onOpenChange } = useRootContext();
	const { collection: customerCollection } = useCollection('customers');
	const { format } = useCustomerNameFormat();
	const [loading, setLoading] = React.useState(false);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			billing,
			shipping,
		},
	});

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ billing, shipping });
	}, [billing, shipping, form]);

	/**
	 *
	 */
	const handleSaveToOrder = async (data) => {
		await localPatch({
			document: currentOrder,
			data: {
				billing: data.billing,
				shipping: data.shipping,
			},
		});
		onOpenChange(false);
	};

	/**
	 * We need to get the customer document and patch it with the new address
	 */
	const handleSaveToOrderAndToCustomer = async (data) => {
		await handleSaveToOrder(data);
		const customer = await customerCollection.findOne({ selector: { id: customerID } }).exec();
		if (!customer) {
			Toast.show({
				type: 'error',
				text1: t('No customer found', { _tags: 'core' }),
			});
		}
		setLoading(true);
		try {
			const savedDoc = await patch({
				document: customer,
				data: {
					billing: data.billing,
					shipping: data.shipping,
				},
			});
			if (isRxDocument(savedDoc)) {
				Toast.show({
					type: 'success',
					text1: t('{name} saved', { _tags: 'core', name: format(savedDoc) }),
				});
			}
			onOpenChange(false);
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
			});
		} finally {
			setLoading(false);
		}
	};

	/**
	 *
	 */
	const handleCopyBillingToShipping = React.useCallback(() => {
		const billingAddress = form.getValues().billing;
		form.setValue('shipping', billingAddress);
	}, [form]);

	/**
	 * Form submission handlers that include validation
	 */
	const onSaveToOrder = form.handleSubmit(handleSaveToOrder);
	const onSaveToOrderAndCustomer = form.handleSubmit(handleSaveToOrderAndToCustomer);

	/**
	 * Form doesn't have a ref? What else should I use?
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<Collapsible defaultOpen={true}>
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
				<DialogFooter className="px-0">
					<DialogClose>{t('Close', { _tags: 'core' })}</DialogClose>
					{customerID !== 0 && (
						<DialogAction onPress={onSaveToOrderAndCustomer} loading={loading}>
							{t('Save to Order & Customer', { _tags: 'core' })}
						</DialogAction>
					)}
					<DialogAction onPress={onSaveToOrder} loading={loading}>
						{t('Save to Order', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
