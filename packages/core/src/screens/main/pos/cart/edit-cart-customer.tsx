import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useRecordField } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { BillingAddressForm, billingAddressSchema } from '../../components/billing-address-form';
import { TaxIdsForm, taxIdsFormSchema } from '../../components/customer/tax-ids-form';
import { FormErrors } from '../../components/form-errors';
import { ShippingAddressForm, shippingAddressSchema } from '../../components/shipping-address-form';
import { useSetCartCustomer } from '../hooks/use-set-cart-customer';
import { useCartCustomerRecord } from '../commands/use-cart-customer-record';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useUserCapabilities } from '../../hooks/use-user-capabilities';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);
/**
 *
 */
const formSchema = z.object({
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	tax_ids: taxIdsFormSchema,
});

/**
 * RxDocument .billing$ and .shipping$ emit Proxy(Object) which can't be used in react-hook-form
 */
export function EditCartCustomerForm() {
	return (
		<SavedFieldProvider>
			<EditCartCustomerFields />
		</SavedFieldProvider>
	);
}

function EditCartCustomerFields() {
	const t = useT();
	const { currentOrderRecord } = useCurrentOrder();
	const customerID = useRecordField(currentOrderRecord, (order) => order.payload.customer_id);
	const billingProxy = useRecordField(currentOrderRecord, (order) => order.payload.billing);
	const shippingProxy = useRecordField(currentOrderRecord, (order) => order.payload.shipping);
	const taxIdsProxy = useRecordField(currentOrderRecord, (order) => order.payload.tax_ids);
	const billing = React.useMemo(() => JSON.parse(JSON.stringify(billingProxy)), [billingProxy]);
	const shipping = React.useMemo(() => JSON.parse(JSON.stringify(shippingProxy)), [shippingProxy]);
	const tax_ids = React.useMemo(
		() => (Array.isArray(taxIdsProxy) ? JSON.parse(JSON.stringify(taxIdsProxy)) : []),
		[taxIdsProxy]
	);
	const setCartCustomer = useSetCartCustomer();
	const { saveCustomerAddresses } = useCartCustomerRecord();
	const markSaved = useMarkSaved();
	const { format } = useCustomerNameFormat();
	const [loading, setLoading] = React.useState(false);
	const { caps } = useUserCapabilities();

	/**
	 * This form writes what it shows: reactive values would reset the draft when a write lands.
	 * The caller keys it by order UUID so switching orders remounts it with fresh defaults.
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: { billing, shipping, tax_ids },
	});

	const handleChange = async (changes: Partial<FormValues>) => {
		const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
		// The writer takes the whole address set, so the whole set is validated before it goes: an
		// invalid email left in one field must not ride along with an edit to another.
		if (!(await form.trigger())) return false;
		// The validated output, as the old Save wrote it (unknown keys stripped), and a tax-id row
		// the cashier has only just added (no value yet) is not an edit.
		const values = formSchema.parse(form.getValues());
		return setCartCustomer(currentOrderRecord, {
			billing: values.billing,
			shipping: values.shipping,
			taxIds: (values.tax_ids ?? []).filter((row) => String(row?.value ?? '') !== ''),
		}).then((written) => {
			if (written) markSaved([root]);
			return Boolean(written);
		});
	};
	useFormChangeHandler({ form, onChange: handleChange });

	/**
	 * We need to get the customer document and patch it with the new address
	 */
	const handleUpdateCustomer = async (data: FormValues) => {
		const wooCustomerId = Number(customerID ?? 0);
		setLoading(true);
		try {
			const result = await saveCustomerAddresses(wooCustomerId, data);
			if (result.status === 'not-found') {
				// The order's address saves independently; only the profile copy could
				// not be made, because the customer record is not on this device.
				cartLogger.info('Customer record is not on this device; profile not updated', {
					showToast: true,
					toast: { title: t('pos_cart.customer_profile_not_on_device'), type: 'warning' },
					context: {
						customerId: wooCustomerId,
					},
				});
				return;
			}
			if (result.status === 'saved') {
				const saved = result.customer.getLatest().payload;
				cartLogger.success(t('common.saved', { name: format(saved) }), {
					showToast: true,
					context: {
						customerId: saved.id,
						customerName: format(saved),
					},
				});
			}
		} catch (error) {
			// patch() and localPatch report their own failures (a scope that moved twice).
			if (isErrorReported(error)) return;
			const errorMessage = getErrorMessage(error);
			cartLogger.error('Failed to save customer', {
				showToast: true,
				code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
				toast: { title: t('common.failed_to_save_customer') },
				context: {
					customerId: wooCustomerId,
					error: errorMessage,
				},
			});
		} finally {
			setLoading(false);
		}
	};

	/**
	 *
	 */
	// A named setValue is a change the handler sees (and validates, then writes) like any other.
	const handleCopyBillingToShipping = React.useCallback(() => {
		form.setValue('shipping', form.getValues().billing);
	}, [form]);

	/**
	 * Form submission handlers that include validation
	 */
	const onUpdateCustomer = form.handleSubmit(handleUpdateCustomer);

	/**
	 * Form doesn't have a ref? What else should I use?
	 */
	return (
		<Form {...form}>
			<DialogBody>
				<VStack className="gap-4">
					<FormErrors />
					<Collapsible defaultOpen={true}>
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
							<VStack className="gap-4">
								<Button
									testID="cart-address-copy-billing"
									variant="outline"
									onPress={handleCopyBillingToShipping}
								>
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
				</VStack>
			</DialogBody>
			<DialogFooter
				close
				secondary={
					customerID != null &&
					!isGuestCustomer(customerID) &&
					caps.canEditCustomers && {
						label: t('pos_cart.update_customer_too'),
						testID: 'cart-address-update-customer',
						onPress: () => void onUpdateCustomer(),
						loading,
					}
				}
			/>
		</Form>
	);
}
