import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormTextarea,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalAction, ModalClose, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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

const mutationLogger = getLogger(['wcpos', 'mutations', 'order']);

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
		throw new Error(t('orders.order_not_found'));
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
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	type FormValues = z.infer<typeof formSchema>;
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		values: formData as FormValues,
	});

	/**
	 * Handle save button click
	 */
	const handleSaveToServer = React.useCallback(
		async (data: z.infer<typeof formSchema>) => {
			setLoading(true);
			try {
				await localPatch({
					document: order,
					data: data as unknown as Partial<import('@wcpos/database').OrderDocument>,
				});
				await pushDocument(order).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						const doc = savedDoc as unknown as { id?: number; number?: string };
						mutationLogger.success(t('common.order_saved', { number: doc.number }), {
							showToast: true,
							saveToDb: true,
							context: {
								orderId: doc.id,
								orderNumber: doc.number,
							},
						});
					}
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('common.failed_to_save_order'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						orderId: order.id,
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, order, pushDocument, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSaveToServer);

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
					throw new Error(t('orders.customer_not_found'));
				}

				/**
				 * @FIXME - this is similar to the transformCustomerJSONToOrderJSON function
				 * Should we set the store country if there is no country in the billing object?
				 */
				const customerData = customer as any;
				const billing = {
					...customerData.billing,
					first_name: customerData.billing?.first_name || customerData.first_name,
					last_name: customerData.billing?.last_name || customerData.last_name,
					email: customerData.billing?.email || customerData.email,
				};

				form.setValue('billing', billing, { shouldValidate: true });
				form.setValue('shipping', customerData.shipping, { shouldValidate: true });

				form.setValue('customer_id', customerId);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error('Error fetching customer', {
					context: {
						errorCode: ERROR_CODES.RECORD_NOT_FOUND,
						customerId,
						error: errorMessage,
					},
				});
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
				<VStack className="gap-4">
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="status"
							render={({ field: { value, ...fieldRest } }) => (
								<View className="flex-1">
									<FormSelect
										label={t('common.status')}
										customComponent={OrderStatusSelect}
										value={value as never}
										{...fieldRest}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="parent_id"
							render={({ field: { value, ...fieldRest } }) => (
								<View className="flex-1">
									<FormInput label={t('orders.parent_id')} value={value as never} {...fieldRest} />
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="customer_id"
							render={({ field }) => (
								<View className="flex-1">
									{/* FormCombobox intersection type creates impossible string & Option for value prop */}
									{React.createElement(FormCombobox, {
										customComponent: CustomerSelect,
										label: t('common.customer'),
										withGuest: true,
										...field,
										value: {
											value: String(field.value),
											label: customerLabel,
										},
									} as never)}
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="customer_note"
							render={({ field }) => (
								<View className="flex-1">
									<FormTextarea label={t('common.customer_note')} {...field} />
								</View>
							)}
						/>
					</HStack>
					<Collapsible>
						<CollapsibleTrigger>
							<Text>{t('common.billing_address')}</Text>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<BillingAddressForm />
						</CollapsibleContent>
					</Collapsible>
					<Collapsible>
						<CollapsibleTrigger>
							<Text>{t('common.shipping_address')}</Text>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<ShippingAddressForm />
						</CollapsibleContent>
					</Collapsible>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="payment_method"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('orders.payment_method_id')} {...field} />
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="payment_method_title"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('orders.payment_method_title')} {...field} />
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="currency"
							render={({ field: { value, ...fieldRest } }) => (
								<View className="flex-1">
									<FormSelect
										customComponent={CurrencySelect}
										label={t('common.currency')}
										value={value as never}
										{...fieldRest}
									/>
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="transaction_id"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('common.transaction_id')} {...field} />
								</View>
							)}
						/>
					</HStack>
					<MetaDataForm name="meta_data" />
				</VStack>
				<ModalFooter className="px-0">
					<ModalClose>{t('common.cancel')}</ModalClose>
					<ModalAction loading={loading} onPress={onSave}>
						{t('common.save')}
					</ModalAction>
				</ModalFooter>
			</VStack>
		</Form>
	);
};
