import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { VStack } from '@wcpos/components/vstack';
import { useRecordField } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { CountriesProvider } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';
import { billingAddressSchema } from '../../components/billing-address-form';
import {
	ADDRESS_FACTS,
	asShipping,
	TextPart,
	useAddressFacts,
} from '../../components/customer/address-rows';
import {
	TAX_ID_DEFAULT_ROW,
	TaxIdsForm,
	taxIdsFormSchema,
} from '../../components/customer/tax-ids-form';
import { FormErrors } from '../../components/form-errors';
import { shippingAddressSchema } from '../../components/shipping-address-form';
import { useFieldPresence } from '../../components/use-field-presence';
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

type Verb = [id: string, label: string, onPress: () => void];
const verb = ([id, label, onPress]: Verb) => (
	<PropertyVerb key={id} testID={`cart-address-${id}`} onPress={onPress}>
		{label}
	</PropertyVerb>
);

/**
 * RxDocument .billing$ and .shipping$ emit Proxy(Object) which can't be used in react-hook-form
 */
export function EditCartCustomerForm() {
	return (
		<SavedFieldProvider>
			<CountriesProvider>
				<EditCartCustomerFields />
			</CountriesProvider>
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
	const { linked, focus, labels, ...address } = useAddressFacts(form, 'cart-address');

	// While linked, a write carries billing as shipping; a verb's own shipping write lands as set.
	const shippingOf = (values: FormValues) =>
		linked ? asShipping(values.billing) : values.shipping;
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
			shipping: root === 'shipping' ? values.shipping : shippingOf(values),
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
			const result = await saveCustomerAddresses(wooCustomerId, {
				...data,
				shipping: shippingOf(data),
			});
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

	const presence = useFieldPresence(ADDRESS_FACTS, address.isEmpty, address.clear);
	const has = (name: string) => presence.present.includes(name as never);
	const { offered, rows } = address.layout(presence);
	const add = (name: (typeof offered)[number]) => {
		presence.add(name);
		address.added(name);
	};

	/**
	 * Form submission handlers that include validation
	 */
	const onUpdateCustomer = form.handleSubmit(handleUpdateCustomer);

	return (
		<Form {...form}>
			<DialogBody>
				<VStack className="gap-4">
					<FormErrors />
					<PropertyList>
						<PropertyRow
							testID="cart-address-row-name"
							label={t('common.name')}
							trailing={<SavedMark name="billing" label={t('settings.saved')} />}
						>
							<HStack className="gap-2">
								{(['first_name', 'last_name'] as const).map((name) => (
									<TextPart
										key={name}
										name={`billing.${name}`}
										placeholder={labels[name]}
										testID={`cart-address-field-billing-${name}`}
									/>
								))}
							</HStack>
						</PropertyRow>
						{(['email', 'phone', 'company'] as const).map(
							(name) =>
								(name !== 'company' || has(name)) && (
									<PropertyRow
										key={name}
										testID={`cart-address-row-${name}`}
										label={labels[name]}
										trailing={
											name === 'company' &&
											verb(['remove-company', t('common.remove'), () => presence.withdraw(name)])
										}
									>
										<TextPart
											name={`billing.${name}`}
											placeholder={t('common.add_value', { label: labels[name] })}
											autoFocus={focus === name}
											testID={`cart-address-field-billing-${name}`}
										/>
									</PropertyRow>
								)
						)}
						{rows}
						<TaxIdsForm rows testID="cart-address" />
						<PropertyAddRow>
							{offered.map((name) => (
								<PropertyAdd
									key={name}
									testID={`cart-address-add-${name}`}
									label={labels[name]}
									onPress={() => add(name)}
								/>
							))}
							<PropertyAdd
								testID="cart-address-add-tax_id"
								label={t('tax_id.tax_id')}
								onPress={() =>
									form.setValue('tax_ids', [
										...(form.getValues().tax_ids ?? []),
										TAX_ID_DEFAULT_ROW,
									])
								}
							/>
						</PropertyAddRow>
					</PropertyList>
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
