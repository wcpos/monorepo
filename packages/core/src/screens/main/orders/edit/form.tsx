import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { useForm, useWatch } from 'react-hook-form';
import { map } from 'rxjs/operators';
import * as z from 'zod';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Button } from '@wcpos/components/button';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormSelect,
	FormTextarea,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import {
	DialogAction,
	DialogBody,
	DialogClose,
	DialogFooter,
	useDialog,
} from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, type OrderPayload, useRecordField } from '@wcpos/query';
import { GUEST_CUSTOMER_ID, isGuestCustomer, PROTECTED_ORDER_META_KEYS } from '@wcpos/sync-core';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useEngineRecordByWooId } from '@wcpos/query/record-readers';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { CurrencySelect } from '../../components/currency-select';
import { CustomerSelect } from '../../components/customer-select';
import { TaxIdsForm, taxIdsFormSchema } from '../../components/customer/tax-ids-form';
import { FormErrors } from '../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../components/meta-data-form';
import { OrderStatusSelect } from '../../components/order/order-status-select';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import { reportPushFailure } from '../../contexts/push-failure-code';
import { usePushDocument } from '../../contexts/use-push-document';
import { useOrderRecord } from '../commands/use-order-record';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useGuestCustomer } from '../../hooks/use-guest-customer';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';

const mutationLogger = getLogger(['wcpos', 'mutations', 'order']);

interface Props {
	order: EngineRecord<'orders'>;
}

const formSchema = z.object({
	status: z.string(),
	parent_id: z.number().optional(),
	customer_id: z.number().default(GUEST_CUSTOMER_ID),
	customer_note: z.string().optional(),
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	payment_method: z.string().optional(),
	payment_method_title: z.string().optional(),
	currency: z.string().optional(),
	transaction_id: z.string().optional(),
	meta_data: metaDataSchema,
	tax_ids: taxIdsFormSchema,
});

/**
 *
 */
export function EditOrderForm({ order }: Props) {
	const pushDocument = usePushDocument();
	const { saveOrderFields } = useOrderRecord();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { close } = useDialog();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const { format } = useCustomerNameFormat();
	const [customerIdToLoad, setCustomerIdToLoad] = React.useState<number | null>(null);
	const customerIdForLookup = customerIdToLoad ?? 0;
	const customerResource = useEngineRecordByWooId('customers', customerIdForLookup);
	const customerLookup$ = React.useMemo(
		() =>
			customerResource.valueRef$$.pipe(
				// eslint-disable-next-line react-hooks/refs -- runs inside the observable on emission, not during render; the component does not compile anyway (try/finally, ThrowStatement in try/catch), so this predates and survives the useWatch migration
				map((valueRef) => ({
					requestedId: customerIdForLookup,
					record: valueRef?.current,
				}))
			),
		[customerIdForLookup, customerResource]
	);
	const customerLookup = useObservableEagerState(customerLookup$);
	const guestCustomer = useGuestCustomer();

	if (!order) {
		throw new Error(t('orders.order_not_found'));
	}

	/**
	 * We need to refresh the component when the order data changes
	 */
	const formData = useRecordField(order, (record) => {
		const latest = record.payload;
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
			tax_ids: (latest as { tax_ids?: unknown[] }).tax_ids ?? [],
		};
	});

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
			// #163 ruling R5: this is an order save. `localPatch` swallows storage
			// failures, so without this guard the push would go out built on a local
			// patch that never landed.
			if (blockIfDegraded('save-order', { orderId: order.uuid })) return;

			setLoading(true);
			try {
				const patched = await saveOrderFields(order, data as unknown as Partial<OrderPayload>);
				// localPatch reports its own failure (row + toast) and resolves undefined.
				// Pushing anyway would sync the unchanged resident and report success;
				// reporting it again would put a second row and toast on one failure.
				if (!patched) return;
				if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
				await pushDocument(order).then((savedDoc) => {
					if (savedDoc) {
						const saved = order.getLatest().payload;
						mutationLogger.success(t('common.order_saved', { number: saved.number }), {
							showToast: true,
							context: {
								orderId: saved.id,
								orderNumber: saved.number,
							},
						});
						close();
					}
				});
			} catch (error) {
				// A localPatch rethrow (the scope moved twice) is already reported.
				if (isErrorReported(error)) return;
				reportPushFailure(mutationLogger, 'Failed to save order', error, {
					title: t('common.failed_to_save_order'),
					stillSendingTitle: t('common.order_still_sending'),
					context: { orderId: order.getLatest().payload.id },
				});
			} finally {
				setLoading(false);
			}
		},
		[blockIfDegraded, close, saveOrderFields, order, pushDocument, t]
	);

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSaveToServer);

	/**
	 * Fetch customer record and update form fields.
	 */
	const handleCustomerChange = React.useCallback(
		(
			customerId: number,
			selectedCustomer: EngineRecord<'customers'> | ReturnType<typeof useGuestCustomer>
		) => {
			// customerId can be 0
			if (customerId === undefined || customerId === null) return;

			try {
				const customerData = (
					'getLatest' in selectedCustomer ? selectedCustomer.getLatest().payload : selectedCustomer
				) as EngineRecord<'customers'>['payload'];

				/**
				 * @FIXME - this is similar to the transformCustomerJSONToOrderJSON function
				 * Should we set the store country if there is no country in the billing object?
				 */
				const billing = {
					...customerData.billing,
					first_name: customerData.billing?.first_name || customerData.first_name,
					last_name: customerData.billing?.last_name || customerData.last_name,
					email: customerData.billing?.email || customerData.email,
				};

				form.setValue('billing', billing, { shouldValidate: true });
				form.setValue('shipping', customerData.shipping, {
					shouldValidate: true,
				});
				// Snapshot the customer's tax IDs onto the order at attach time
				// (mirrors `transformCustomerJSONToOrderJSON`). Empty array
				// when the customer has none — overrides the prior snapshot.
				form.setValue(
					'tax_ids',
					(Array.isArray(customerData.tax_ids) ? customerData.tax_ids : []) as z.infer<
						typeof formSchema
					>['tax_ids'],
					{ shouldValidate: true }
				);

				form.setValue('customer_id', customerId);
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				mutationLogger.error('Error fetching customer', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					context: {
						customerId,
						error: errorMessage,
					},
				});
			}
		},
		[form]
	);

	/**
	 * Apply the selected external engine customer after its reactive lookup resolves.
	 */
	React.useEffect(() => {
		if (customerIdToLoad === null) return;
		const selectedCustomer = isGuestCustomer(customerIdToLoad)
			? guestCustomer
			: customerLookup?.requestedId === customerIdToLoad
				? customerLookup.record
				: undefined;
		if (selectedCustomer === undefined) return;
		if (selectedCustomer === null) {
			// Nothing is broken — the record has not synced to this device yet — but
			// the cashier picked a customer and saw nothing happen, so say why.
			mutationLogger.info('Selected customer is not on this device', {
				showToast: true,
				toast: { title: t('orders.customer_not_on_device'), type: 'warning' },
				context: { customerId: customerIdToLoad },
			});
			// eslint-disable-next-line react-hooks/set-state-in-effect -- effect-as-event-handler for the async customer lookup; pre-existing, surfaced when form.watch's compiler bailout went away. The component does not compile regardless (try/finally). Follow-up: fire this from the lookup emission instead.
			setCustomerIdToLoad(null);
			return;
		}
		handleCustomerChange(customerIdToLoad, selectedCustomer);
		setCustomerIdToLoad(null);
	}, [customerIdToLoad, customerLookup, guestCustomer, handleCustomerChange, t]);

	/**
	 * Watch the customer fields to compute the customer label
	 */
	const customer_id = useWatch({ control: form.control, name: 'customer_id' });
	const billing = useWatch({ control: form.control, name: 'billing' });
	const shipping = useWatch({ control: form.control, name: 'shipping' });

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
			<DialogBody contentContainerClassName="gap-4">
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
										value={value}
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
									<FormCombobox
										customComponent={CustomerSelect}
										label={t('common.customer')}
										withGuest
										{...field}
										onChange={(value: string) => {
											const customerId = Number(value);
											field.onChange(customerId);
											setCustomerIdToLoad(customerId);
										}}
										// The field holds a customer id; its label is resolved separately, so
										// the pair is passed through rather than derived from the scalar.
										value={{ value: String(field.value), label: customerLabel }}
									/>
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
										value={value}
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
					<TaxIdsForm name="tax_ids" />
					<MetaDataForm name="meta_data" hiddenKeys={PROTECTED_ORDER_META_KEYS} />
				</VStack>
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.cancel')}</DialogClose>
				<DialogAction
					testID="order-edit-save-button"
					asChild
					onPress={() => void onSave()}
					disabled={storageDegraded}
				>
					<Button loading={loading}>{t('common.save')}</Button>
				</DialogAction>
			</DialogFooter>
		</Form>
	);
}
