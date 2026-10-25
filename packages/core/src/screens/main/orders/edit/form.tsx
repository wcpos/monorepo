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
	FormItem,
	FormLabel,
	FormSelect,
	FormTextarea,
	SavedFieldProvider,
	SavedMark,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogClose, DialogFooter } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	type EngineRecord,
	useRecordField,
	WriteDeferredError,
	WriteOutcomeTimeoutError,
} from '@wcpos/query';
import {
	GUEST_CUSTOMER_ID,
	isGuestCustomer,
	isPushableOrderStatus,
	PROTECTED_ORDER_META_KEYS,
	PUSHABLE_ORDER_STATUSES,
} from '@wcpos/sync-core';
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
import { useRecordAutosave } from '../../components/use-record-autosave';
import { OrderStatusSelect } from '../../components/order/order-status-select';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import { pushFailureCode, reportPushFailure } from '../../contexts/push-failure-code';
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

const statusSchema = z.object({ status: z.string() });
const READ_ONLY_ROOTS = ['parent_id', 'payment_method', 'payment_method_title', 'transaction_id'];
type FormValues = z.infer<typeof formSchema>;

export function EditOrderForm({ order }: Props) {
	return (
		<SavedFieldProvider>
			<EditOrderFormFields order={order} />
		</SavedFieldProvider>
	);
}

function EditOrderFormFields({ order }: Props) {
	const pushDocument = usePushDocument();
	const { saveOrderFields } = useOrderRecord();
	const t = useT();
	const [loading, setLoading] = React.useState(false);
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

	// The draft opens once per order (the modal keys this form). Write echoes must not reset it.
	const [formData] = React.useState(() => {
		const latest = order.toMutableJSON().payload;
		return {
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
			tax_ids: latest.tax_ids ?? [],
		};
	});
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: formData as FormValues,
	});
	const markSaved = useMarkSaved();
	const { flush } = useRecordAutosave({
		form,
		stored: () => order.getLatest().payload,
		persist: (data) => saveOrderFields(order, data),
		before: (root) => {
			if (READ_ONLY_ROOTS.includes(root)) return false;
			// #163 ruling R5: localPatch swallows storage failures, so the guard runs first.
			return !blockIfDegraded('save-order', { orderId: order.uuid });
		},
		metaDraft: (rows) =>
			rows.filter((row) => !PROTECTED_ORDER_META_KEYS.includes(String(row?.key ?? ''))),
	});

	// Status is read, never written, until Update status: reactive values are right here.
	const currentStatus = useRecordField(order, (record) => record.payload.status) ?? '';
	const statusForm = useForm<{ status: string }>({
		resolver: zodResolver(statusSchema),
		values: { status: currentStatus },
	});
	const status = useWatch({ control: statusForm.control, name: 'status' });
	const onUpdateStatus = statusForm.handleSubmit(handleUpdateStatus);

	async function handleUpdateStatus(data: { status: string }) {
		if (loading) return;
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		setLoading(true);
		if (!(await flush())) {
			setLoading(false);
			return;
		}
		const previous = order.getLatest().payload.status;
		if (data.status === previous) {
			setLoading(false);
			return;
		}
		let patched = false;
		try {
			if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
			if (!(await saveOrderFields(order, { status: data.status }))) return;
			patched = true;
			if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
			await pushDocument(order);
			mutationLogger.success(t('orders.status_updated'), {
				showToast: true,
				context: { orderId: order.getLatest().payload.id, status: data.status },
			});
		} catch (error) {
			// A pending outcome (the wait timed out, or the row is held offline or for a sign-in) is
			// not a refusal: the intent stays queued and lands when the store answers, exactly as the
			// old Save left it, and the cashier is told it is still on its way. Only a refusal rolls
			// the status back (the cart sheet's rule) and pushes the revert.
			const pending =
				error instanceof WriteOutcomeTimeoutError || error instanceof WriteDeferredError;
			if (patched && !pending && !blockIfDegraded('save-order', { orderId: order.uuid })) {
				const reverted = await saveOrderFields(order, { status: previous });
				if (reverted) {
					void pushDocument(order).catch((revertError) =>
						mutationLogger.warn('Failed to send the reverted order', {
							code: pushFailureCode(revertError),
							context: {
								orderId: order.getLatest().payload.id,
								error: getErrorMessage(revertError),
							},
						})
					);
				}
			}
			if (isErrorReported(error)) return;
			// "Still on its way" only when the intent is still queued; after a rollback the cashier
			// must not be told the change is still arriving.
			reportPushFailure(mutationLogger, 'Failed to update order status', error, {
				title: t('common.failed_to_save_order'),
				...(pending ? { stillSendingTitle: t('common.order_still_sending') } : {}),
				context: { orderId: order.getLatest().payload.id },
			});
		} finally {
			setLoading(false);
		}
	}

	/**
	 * Fetch customer record and update form fields.
	 */
	const handleCustomerChange = React.useCallback(
		async (
			customerId: number,
			selectedCustomer: EngineRecord<'customers'> | ReturnType<typeof useGuestCustomer>
		) => {
			// customerId can be 0
			if (customerId === undefined || customerId === null) return;

			try {
				if (!(await flush())) return;
				if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
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

				const patch = {
					customer_id: customerId,
					billing,
					shipping: customerData.shipping,
					// Replace the sale-time snapshot, including clearing the prior customer's IDs.
					tax_ids: Array.isArray(customerData.tax_ids) ? customerData.tax_ids : [],
				};
				const written = await saveOrderFields(order, patch);
				if (!written) return;
				// A reset updates the draft without feeding the compound write back into autosave. It
				// also cancels a debounced write, so a note typed while the patch was in flight is
				// started first; the reset keeps its text (getValues) and the write lands.
				void flush();
				form.reset({ ...form.getValues(), ...patch } as FormValues);
				markSaved(['billing', 'shipping', 'tax_ids', 'customer_id']);
			} catch (error) {
				// A localPatch rethrow (the scope moved twice) is already reported.
				if (isErrorReported(error)) return;
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
		[blockIfDegraded, flush, form, markSaved, order, saveOrderFields]
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
		void handleCustomerChange(customerIdToLoad, selectedCustomer);
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

	// Offer only what a till may push (ADR 0040 D4); a server-owned status shows read-only.
	const statusPushable = isPushableOrderStatus(currentStatus);
	const allowedStatuses = statusPushable
		? PUSHABLE_ORDER_STATUSES
		: [...PUSHABLE_ORDER_STATUSES, ...(currentStatus ? [currentStatus] : [])];

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
							name="parent_id"
							render={({ field: { value, ...fieldRest } }) => (
								<View className="flex-1">
									<FormInput
										label={t('orders.parent_id')}
										editable={false}
										value={value as never}
										{...fieldRest}
									/>
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="customer_id"
							render={({ field }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('common.customer')}</FormLabel>
										<SavedMark name="customer_id" label={t('settings.saved')} />
									</HStack>
									<FormCombobox
										customComponent={CustomerSelect}
										withGuest
										{...field}
										onChange={(value: string) => {
											const customerId = Number(value);
											setCustomerIdToLoad(customerId);
										}}
										// The field holds a customer id; its label is resolved separately, so
										// the pair is passed through rather than derived from the scalar.
										value={{ value: String(field.value), label: customerLabel }}
									/>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="customer_note"
							render={({ field }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('common.customer_note')}</FormLabel>
										<SavedMark name="customer_note" label={t('settings.saved')} />
									</HStack>
									<FormTextarea {...field} />
								</FormItem>
							)}
						/>
					</HStack>
					<Form {...statusForm}>
						{/* The intent's own card (the cart sheet's Hand over): the select's label names it. */}
						<View className="border-border gap-3 rounded-lg border p-4">
							<FormField
								control={statusForm.control}
								name="status"
								render={({ field }) => (
									<View testID="order-edit-status">
										<FormSelect
											label={t('common.status')}
											customComponent={OrderStatusSelect}
											allowed={allowedStatuses}
											disabled={!statusPushable}
											{...field}
										/>
									</View>
								)}
							/>
							<HStack className="justify-end">
								<Button
									variant="outline"
									testID="order-edit-update-status"
									disabled={loading || storageDegraded || status === currentStatus}
									onPress={() => void onUpdateStatus()}
								>
									{t('orders.update_status')}
								</Button>
							</HStack>
						</View>
					</Form>
					<Collapsible>
						<HStack className="justify-between">
							<CollapsibleTrigger>
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
							<ShippingAddressForm />
						</CollapsibleContent>
					</Collapsible>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="payment_method"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('orders.payment_method_id')} editable={false} {...field} />
								</View>
							)}
						/>
						<FormField
							control={form.control}
							name="payment_method_title"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('orders.payment_method_title')} editable={false} {...field} />
								</View>
							)}
						/>
					</HStack>
					<HStack className="gap-4">
						<FormField
							control={form.control}
							name="currency"
							render={({ field: { value, ...fieldRest } }) => (
								<FormItem className="flex-1">
									<HStack className="justify-between">
										<FormLabel>{t('common.currency')}</FormLabel>
										<SavedMark name="currency" label={t('settings.saved')} />
									</HStack>
									<FormSelect customComponent={CurrencySelect} value={value} {...fieldRest} />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="transaction_id"
							render={({ field }) => (
								<View className="flex-1">
									<FormInput label={t('common.transaction_id')} editable={false} {...field} />
								</View>
							)}
						/>
					</HStack>
					<HStack className="items-start justify-between">
						<View className="flex-1">
							<TaxIdsForm name="tax_ids" />
						</View>
						<SavedMark name="tax_ids" label={t('settings.saved')} />
					</HStack>
					<View className="relative">
						<MetaDataForm name="meta_data" hiddenKeys={PROTECTED_ORDER_META_KEYS} />
						{/* Out of flow, beside the component's own heading: the mark never moves the rows. */}
						<View className="pointer-events-none absolute top-0 right-0">
							<SavedMark name="meta_data" label={t('settings.saved')} />
						</View>
					</View>
				</VStack>
			</DialogBody>
			<DialogFooter>
				<DialogClose testID="order-edit-close-button">{t('common.close')}</DialogClose>
			</DialogFooter>
		</Form>
	);
}
