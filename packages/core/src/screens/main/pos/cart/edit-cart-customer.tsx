import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { decode } from 'html-entities';
import { useForm, useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Form,
	FormField,
	FormItem,
	FormMessage,
	SavedFieldProvider,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
	useSavedName,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useRecordField } from '@wcpos/query';
import { isGuestCustomer } from '@wcpos/sync-core';
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { CountriesProvider, useCountries } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';
import {
	AddressCountryField,
	AddressStateField,
	billingAddressSchema,
} from '../../components/billing-address-form';
import {
	TAX_ID_DEFAULT_ROW,
	TaxIdsForm,
	taxIdsFormSchema,
} from '../../components/customer/tax-ids-form';
import { EditableField } from '../../components/editable-field';
import { FormErrors } from '../../components/form-errors';
import { shippingAddressSchema } from '../../components/shipping-address-form';
import { useFieldPresence } from '../../components/use-field-presence';
import { useSetCartCustomer } from '../hooks/use-set-cart-customer';
import { useCartCustomerRecord } from '../commands/use-cart-customer-record';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
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

/** An address's parts in row order; the closed line reads them in postal order. */
const ADDRESS_PARTS = ['address_1', 'address_2', 'city', 'postcode', 'country', 'state'] as const;
const LINE_PARTS = ['address_1', 'address_2', 'city', 'state', 'postcode', 'country'] as const;
const SHIPPING_PARTS = ['first_name', 'last_name', 'company', 'phone', ...ADDRESS_PARTS] as const;
/** The offered facts, in canonical order after the asked ones (name, email, phone). */
const OFFERED = [{ name: 'company' }, { name: 'billing' }, { name: 'shipping' }] as const;
/** Select parts: each adopts its row's key as its label (`useFormControlAria`, the item's id). */
const PART_FIELDS = { country: AddressCountryField, state: AddressStateField };
type Address = Record<string, string | undefined> | undefined;
type Verb = [id: string, label: string, onPress: () => void];
const hasAny = (address: Address, parts: readonly string[]) => parts.some((p) => !!address?.[p]);
const sameAddress = (a: Address, b: Address) =>
	SHIPPING_PARTS.every((p) => (a?.[p] ?? '') === (b?.[p] ?? ''));
/** Billing as the shipping address: Woo's checkout with "Ship to a different address?" off. */
const asShipping = (billing: Address) => shippingAddressSchema.shape.shipping.parse(billing ?? {});
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
	const { country: storeCountry } = useBaseTaxLocation();
	// Shipping reads "Same as billing" while it is empty or equal to billing, until a verb says so.
	const [linked, setLinked] = React.useState(
		() => !hasAny(shipping, SHIPPING_PARTS) || sameAddress(shipping, billing)
	);
	const [open, setOpen] = React.useState({ billing: false, shipping: false });
	const [focus, setFocus] = React.useState<string | null>(null);

	/**
	 * This form writes what it shows: reactive values would reset the draft when a write lands.
	 * The caller keys it by order UUID so switching orders remounts it with fresh defaults.
	 */
	type FormValues = z.infer<typeof formSchema>;

	const form = useForm<FormValues, unknown, FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: { billing, shipping, tax_ids },
	});

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

	/** Both verbs start from billing's values; an own address with no country takes the store's. */
	const setShippingOwn = (own: boolean) => {
		const { billing: from } = form.getValues();
		const country = own && !from?.country && storeCountry;
		form.setValue('shipping', country ? { ...from, country } : from);
		setLinked(!own);
		setOpen((current) => ({ ...current, shipping: own }));
	};
	const openPart = (name: 'billing' | 'shipping') => () =>
		setOpen((current) => ({ ...current, [name]: true }));

	const { billing: b, shipping: s } = useWatch({ control: form.control });
	const presence = useFieldPresence(
		OFFERED,
		(name) =>
			({
				company: !b?.company,
				billing: !hasAny(b, ADDRESS_PARTS),
				shipping: linked || !hasAny(s, SHIPPING_PARTS),
			})[name],
		(name) => {
			const parts = name === 'company' ? ['company'] : ADDRESS_PARTS;
			const cleared = Object.fromEntries(parts.map((part) => [part, '']));
			form.setValue('billing', { ...form.getValues().billing, ...cleared });
			if (name === 'billing') setOpen((current) => ({ ...current, billing: false }));
		}
	);
	const has = (name: string) => presence.present.includes(name as never);
	// Shipping is a row whenever billing is: it derives from billing until a verb breaks the link.
	const shippingRow = has('shipping') || has('billing');
	const offered = presence.offered.filter((name) => name !== 'shipping' || !shippingRow);
	const add = (name: (typeof offered)[number]) => {
		presence.add(name);
		setFocus(name);
		if (name === 'billing' && storeCountry) form.setValue('billing.country', storeCountry);
		if (name === 'billing') openPart('billing')();
		if (name === 'shipping') setShippingOwn(true);
	};
	const sameAsBilling: Verb = [
		'shipping-same',
		t('pos_cart.same_as_billing'),
		() => setShippingOwn(false),
	];
	const shippingVerbs: Verb[] = linked
		? [['shipping-different', t('pos_cart.use_different_address'), () => setShippingOwn(true)]]
		: open.shipping
			? [sameAsBilling]
			: [['edit-shipping', t('common.edit'), openPart('shipping')], sameAsBilling];
	const labels: Record<string, string> = {
		company: t('common.company'),
		billing: t('common.billing_address'),
		shipping: t('common.shipping_address'),
		email: t('common.email'),
		phone: t('common.phone'),
		first_name: t('common.first_name'),
		last_name: t('common.last_name'),
		address_1: t('common.address_1'),
		address_2: t('common.address_2'),
		city: t('common.city'),
		postcode: t('common.postcode'),
		country: t('common.country'),
		state: t('common.state'),
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
								<TextPart name="billing.first_name" placeholder={labels.first_name} />
								<TextPart name="billing.last_name" placeholder={labels.last_name} />
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
											verb(['remove-company', t('common.remove'), () => presence.remove(name)])
										}
									>
										<TextPart
											name={`billing.${name}`}
											placeholder={t('common.add_value', { label: labels[name] })}
											autoFocus={focus === name}
										/>
									</PropertyRow>
								)
						)}
						{has('billing') && (
							<AddressRows
								prefix="billing"
								labels={labels}
								open={open.billing}
								onOpen={openPart('billing')}
								autoFocus={focus === 'billing'}
								verbs={[
									open.billing
										? ['remove-billing', t('common.remove'), () => presence.remove('billing')]
										: ['edit-billing', t('common.edit'), openPart('billing')],
								]}
							/>
						)}
						{shippingRow && (
							<AddressRows
								prefix="shipping"
								labels={labels}
								open={!linked && open.shipping}
								onOpen={openPart('shipping')}
								derived={linked ? t('pos_cart.same_as_billing') : undefined}
								verbs={shippingVerbs}
							/>
						)}
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

/** One text fact: the value at rest, a field while editing; it commits on blur or Enter. */
function TextPart(props: { name: string; placeholder: string; autoFocus?: boolean }) {
	const { control } = useFormContext();
	return (
		<FormField
			control={control}
			name={props.name}
			render={({ field }) => (
				<FormItem className="min-w-0 flex-1 gap-0">
					<EditableField
						variant="ghost"
						bold={false}
						value={field.value ?? ''}
						onChangeText={field.onChange}
						placeholder={props.placeholder}
						startEditing={props.autoFocus}
					/>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

/**
 * A compound fact: its key row (closed: one line, or the derived value) and, open, its parts as
 * indented rows. Open lasts for the dialog's life; there is no close verb.
 */
function AddressRows({
	prefix,
	labels,
	open,
	onOpen,
	autoFocus,
	derived,
	verbs,
}: {
	prefix: 'billing' | 'shipping';
	labels: Record<string, string>;
	open: boolean;
	onOpen: () => void;
	autoFocus?: boolean;
	derived?: string;
	verbs: Verb[];
}) {
	const t = useT();
	const countries = useCountries();
	const marked = useSavedName() === prefix && prefix === 'shipping';
	const address = useWatch({ name: prefix }) as Address;
	const line = LINE_PARTS.map((part) =>
		part === 'country' && address?.country
			? decode(countries.find(({ code }) => code === address.country)?.name ?? address.country)
			: address?.[part]
	)
		.filter(Boolean)
		.join(', ');
	return (
		<>
			<PropertyRow
				testID={`cart-address-row-${prefix}`}
				label={labels[prefix]}
				trailing={
					marked ? <SavedMark name="shipping" label={t('settings.saved')} /> : verbs.map(verb)
				}
			>
				{open ? null : derived ? (
					<Text className="text-muted-foreground">{derived}</Text>
				) : (
					<Text onPress={onOpen}>{line}</Text>
				)}
			</PropertyRow>
			{open &&
				(prefix === 'billing' ? ADDRESS_PARTS : SHIPPING_PARTS).map((part) => (
					<PropertyRow
						key={part}
						indent
						label={labels[part]}
						nativeID={`${prefix}-${part}-form-item`}
					>
						{part === 'country' || part === 'state' ? (
							<FormItem nativeID={`${prefix}-${part}`}>
								{React.createElement(PART_FIELDS[part], { prefix })}
							</FormItem>
						) : (
							<TextPart
								name={`${prefix}.${part}`}
								placeholder={t('common.add_value', { label: labels[part] })}
								autoFocus={autoFocus && part === 'address_1'}
							/>
						)}
					</PropertyRow>
				))}
		</>
	);
}
