import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from '@wcpos/components/src/collapsible';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormTextarea,
} from '@wcpos/components/src/form';
import { ModalAction, ModalClose, ModalFooter } from '@wcpos/components/src/modal';
import { Text } from '@wcpos/components/src/text';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { CurrencySelect } from '../../components/currency-select';
import { CustomerSelect } from '../../components/customer-select';
import { FormErrors } from '../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { OrderStatusSelect } from '../../components/order/order-status-select';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import usePushDocument from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCollection } from '../../hooks/use-collection';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useGuestCustomer } from '../../hooks/use-guest-customer';

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

const formSchema = z.object({
	status: z.string(),
	parent_id: z.number().optional(),
	customer_id: z.number().default(0),
	customer_note: z.string().optional(),
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	payment_method: z.string().optional(),
	payment_method_title: z.string().optional(),
	currency: z.string().optional(),
	transaction_id: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditOrderForm = ({ order }: Props) => {
	const pushDocument = usePushDocument();
	const { localPatch } = useLocalMutation();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { format } = useCustomerNameFormat();
	const previousCustomerId = React.useRef<number | undefined>(order?.getLatest().customer_id);
	const { collection } = useCollection('customers');
	const guestCustomer = useGuestCustomer();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	/**
	 * We need to refresh the component when the order data changes
	 */
	const formData = useObservablePickState(
		order.$,
		() => {
			const latest = order.getLatest();
			return {
				status: latest.status,
				parent_id: latest.parent_id,
				currency: latest.currency,
				customer_id: latest.customer_id,
				customer_note: latest.customer_note,
				billing: latest.billing,
				shipping: latest.shipping,
				payment_method: latest.payment_method,
				payment_method_title: latest.payment_method_title,
				transaction_id: latest.transaction_id,
				meta_data: latest.meta_data,
			};
		},
		'status',
		'parent_id',
		'currency',
		'customer_id',
		'customer_note',
		'billing',
		'shipping',
		'payment_method',
		'payment_method_title',
		'transaction_id',
		'meta_data'
	);

	/**
	 * Handle save button click
	 */
	const handleSaveToServer = React.useCallback(
		async (data) => {
			setLoading(true);
			try {
				await localPatch({
					document: order,
					data,
				});
				await pushDocument(order).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						Toast.show({
							type: 'success',
							text1: t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }),
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
		[localPatch, order, pushDocument, t]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: { ...formData },
	});

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Fetch customer record and update form fields.
	 */
	const handleCustomerChange = React.useCallback(
		async (customerId: number) => {
			// customerId can be 0
			if (customerId === undefined || customerId === null) return;

			try {
				let customer;
				if (customerId === 0) {
					customer = guestCustomer;
				} else {
					customer = await collection.findOne({ selector: { id: customerId } }).exec();
					// this is not needed, because the customer must be local to be selected, right?
					// if (!customer) {
					// 	customer = await pullDocument(customerId, collection);
					// }
				}

				if (!customer) {
					throw new Error(t('Customer not found', { _tags: 'core' }));
				}

				/**
				 * @FIXME - this is similar to the transformCustomerJSONToOrderJSON function
				 * Should we set the store country if there is no country in the billing object?
				 */
				const billing = {
					...customer.billing,
					first_name: customer.billing.first_name || customer.first_name,
					last_name: customer.billing.last_name || customer.last_name,
					email: customer.billing.email || customer.email,
				};

				form.setValue('billing', billing, { shouldValidate: true });
				form.setValue('shipping', customer.shipping, { shouldValidate: true });

				form.setValue('customer_id', customerId);
			} catch (error) {
				log.error('Error fetching customer:', error);
			}
		},
		[form, collection, guestCustomer, t]
	);

	/**
	 * Watch for changes in `customer_id` and call handleCustomerChange only if it changes.
	 */
	React.useEffect(() => {
		const subscription = form.watch((values) => {
			if (
				values.customer_id !== undefined &&
				values.customer_id !== null &&
				previousCustomerId.current !== values.customer_id
			) {
				previousCustomerId.current = values.customer_id;
				handleCustomerChange(values.customer_id);
			}
		});
		return () => subscription.unsubscribe();
	}, [form, handleCustomerChange]);

	/**
	 * Watch the customer fields to compute the customer label
	 */
	const customer_id = form.watch('customer_id');
	const billing = form.watch('billing');
	const shipping = form.watch('shipping');

	/**
	 * Compute the customer label
	 */
	const customerLabel = React.useMemo(() => {
		return format({ id: customer_id, billing, shipping });
	}, [customer_id, billing, shipping, format]);

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
						name="status"
						render={({ field }) => (
							<FormSelect
								label={t('Status', { _tags: 'core' })}
								customComponent={OrderStatusSelect}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="parent_id"
						render={({ field }) => (
							<FormInput label={t('Parent ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="customer_id"
						render={({ field }) => (
							<FormCombobox
								customComponent={CustomerSelect}
								label={t('Customer', { _tags: 'core' })}
								withGuest
								{...field}
								// override value with defaultCustomer
								value={{
									value: field.value,
									label: customerLabel,
								}}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="customer_note"
						render={({ field }) => (
							<FormTextarea label={t('Customer Note', { _tags: 'core' })} {...field} />
						)}
					/>
					<View className="col-span-2">
						<Collapsible>
							<CollapsibleTrigger>
								<Text>{t('Billing Address', { _tags: 'core' })}</Text>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<BillingAddressForm />
							</CollapsibleContent>
						</Collapsible>
					</View>
					<View className="col-span-2">
						<Collapsible>
							<CollapsibleTrigger>
								<Text>{t('Shipping Address', { _tags: 'core' })}</Text>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<ShippingAddressForm />
							</CollapsibleContent>
						</Collapsible>
					</View>
					<FormField
						control={form.control}
						name="payment_method"
						render={({ field }) => (
							<FormInput label={t('Payment Method ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="payment_method_title"
						render={({ field }) => (
							<FormInput label={t('Payment Method Title', { _tags: 'core' })} {...field} />
						)}
					/>
					<FormField
						control={form.control}
						name="currency"
						render={({ field }) => (
							<FormSelect
								customComponent={CurrencySelect}
								label={t('Currency', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
					<FormField
						control={form.control}
						name="transaction_id"
						render={({ field }) => (
							<FormInput label={t('Transaction ID', { _tags: 'core' })} {...field} />
						)}
					/>
					<View className="col-span-2">
						<MetaDataForm name="meta_data" />
					</View>
				</View>
				<ModalFooter className="px-0">
					<ModalClose>{t('Cancel', { _tags: 'core' })}</ModalClose>
					<ModalAction loading={loading} onPress={form.handleSubmit(handleSaveToServer)}>
						{t('Save', { _tags: 'core' })}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
