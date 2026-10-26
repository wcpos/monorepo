import * as React from 'react';

import { decode } from 'html-entities';
import { useFormContext, type UseFormReturn, useWatch } from 'react-hook-form';

import {
	FormField,
	FormInput,
	FormItem,
	FormMessage,
	SavedMark,
	useSavedName,
} from '@wcpos/components/form';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';

import { useCountries } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
import { AddressCountryField, AddressStateField } from '../billing-address-form';
import { EditableField } from '../editable-field';
import { shippingAddressSchema } from '../shipping-address-form';

/** An address's parts in row order; the closed line reads them in postal order. */
const ADDRESS_PARTS = ['address_1', 'address_2', 'city', 'postcode', 'country', 'state'] as const;
const LINE_PARTS = ['address_1', 'address_2', 'city', 'state', 'postcode', 'country'] as const;
const SHIPPING_PARTS = ['first_name', 'last_name', 'company', 'phone', ...ADDRESS_PARTS] as const;
/** A customer's billing may carry its own name and email (distinct from the account's). */
export const BILLING_PARTS = ['first_name', 'last_name', 'email', ...ADDRESS_PARTS] as const;
/** The address facts a customer offers, in canonical order: Company, then the two addresses. */
export const ADDRESS_FACTS = [
	{ name: 'company' },
	{ name: 'billing' },
	{ name: 'shipping' },
] as const;
type AddressFact = (typeof ADDRESS_FACTS)[number]['name'];
/** Select parts: each adopts its row's key as its label (`useFormControlAria`, the item's id). */
const PART_FIELDS = { country: AddressCountryField, state: AddressStateField };
type Address = Record<string, string | undefined> | undefined;
type Verb = [id: string, label: string, onPress: () => void];
const hasAny = (address: Address, parts: readonly string[]) => parts.some((p) => !!address?.[p]);
const sameAddress = (a: Address, b: Address) =>
	SHIPPING_PARTS.every((p) => (a?.[p] ?? '') === (b?.[p] ?? ''));
/** Billing as the shipping address: Woo's checkout with "Ship to a different address?" off. */
export const asShipping = (billing: Address) =>
	shippingAddressSchema.shape.shipping.parse(billing ?? {});
/** Shipping follows billing (the row's "Same as billing") while it is empty or billing's copy. */
export const shipsToBilling = (shipping: Address, billing: Address) =>
	!hasAny(shipping, SHIPPING_PARTS) || sameAddress(shipping, billing);
/** A row's verb; its testID is `<prefix>-<id>`. */
const verb = (testID: string, [id, label, onPress]: Verb) => (
	<PropertyVerb key={id} testID={`${testID}-${id}`} onPress={onPress}>
		{label}
	</PropertyVerb>
);

/**
 * A customer form's address facts (Company, Billing, Shipping) for the record's `useFieldPresence`,
 * and their rows. Shipping reads "Same as billing" while it is empty or equal to billing (`linked`)
 * until a verb says so; open lasts for the form's life.
 */
export function useAddressFacts(form: UseFormReturn<any>, testID: string) {
	const t = useT();
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
	const { country: storeCountry } = useBaseTaxLocation();
	const isLinked = ({ billing, shipping }: { billing?: Address; shipping?: Address }) =>
		shipsToBilling(shipping, billing);
	const [linked, setLinked] = React.useState(() => isLinked(form.getValues()));
	// A reset (Sync took the store's copy) fires the watch with no name: the link is read again.
	React.useEffect(() => {
		const subscription = form.watch((values, { name }) => {
			if (!name) setLinked(isLinked(values));
		});
		return () => subscription.unsubscribe();
	}, [form]);
	const [open, setOpen] = React.useState({ billing: false, shipping: false });
	const [focus, setFocus] = React.useState<string | null>(null);
	const { billing: b, shipping: s } = useWatch({ control: form.control });

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
	const isEmpty = (name: AddressFact) =>
		({
			company: !b?.company,
			billing: !hasAny(b, ADDRESS_PARTS),
			shipping: linked || !hasAny(s, SHIPPING_PARTS),
		})[name];
	const clear = (name: AddressFact) => {
		const parts = name === 'company' ? ['company'] : ADDRESS_PARTS;
		const cleared = Object.fromEntries(parts.map((part) => [part, '']));
		form.setValue('billing', { ...form.getValues().billing, ...cleared });
		if (name === 'billing') setOpen((current) => ({ ...current, billing: false }));
	};
	/** After presence adds `name`: it takes focus; an address opens, billing in the store's country. */
	const added = (name: string) => {
		setFocus(name);
		if (name === 'billing' && storeCountry) form.setValue('billing.country', storeCountry);
		if (name === 'billing') openPart('billing')();
		if (name === 'shipping') setShippingOwn(true);
	};
	/** The address rows and the offered facts left for the add row, from the record's presence. */
	const layout = <N extends string>(
		presence: { present: readonly N[]; offered: readonly N[]; withdraw: (name: N) => void },
		options: { input?: boolean; billingMark?: boolean; billingParts?: readonly string[] } = {}
	) => {
		const has = (name: string) => presence.present.includes(name as N);
		// Shipping is a row whenever billing is: it derives from billing until a verb breaks the link.
		const shippingRow = has('shipping') || has('billing');
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
		const common = { testID, labels, input: options.input };
		return {
			offered: presence.offered.filter((name) => name !== 'shipping' || !shippingRow),
			rows: (
				<>
					{has('billing') && (
						<AddressRows
							{...common}
							prefix="billing"
							parts={options.billingParts}
							mark={options.billingMark}
							open={open.billing}
							onOpen={openPart('billing')}
							autoFocus={focus === 'billing'}
							verbs={[
								open.billing
									? ['remove-billing', t('common.remove'), () => presence.withdraw('billing' as N)]
									: ['edit-billing', t('common.edit'), openPart('billing')],
							]}
						/>
					)}
					{shippingRow && (
						<AddressRows
							{...common}
							prefix="shipping"
							mark
							open={!linked && open.shipping}
							onOpen={openPart('shipping')}
							derived={linked ? t('pos_cart.same_as_billing') : undefined}
							verbs={shippingVerbs}
						/>
					)}
				</>
			),
		};
	};
	return { linked, focus, labels, isEmpty, clear, added, layout };
}

/**
 * One text fact. `input`: a field that is typed into (a creation form), named by its row's key;
 * otherwise the value at rest and a field while editing, committing on blur or Enter.
 */
export function TextPart(props: {
	name: string;
	placeholder: string;
	testID: string;
	autoFocus?: boolean;
	input?: boolean;
	secureTextEntry?: boolean;
}) {
	const { control } = useFormContext();
	return (
		<FormField
			control={control}
			name={props.name}
			render={({ field }) => (
				<FormItem
					className="min-w-0 flex-1 gap-0"
					// The row's key is `<id>-form-item`: an input adopts it as its label.
					nativeID={props.input ? props.name.replace('.', '-') : undefined}
				>
					{props.input ? (
						<FormInput
							{...field}
							value={field.value ?? ''}
							placeholder={props.placeholder}
							autoFocus={props.autoFocus}
							secureTextEntry={props.secureTextEntry}
							// A customer's new password, never the cashier's saved login.
							autoComplete={props.secureTextEntry ? 'new-password' : undefined}
							testID={props.testID}
						/>
					) : (
						<EditableField
							variant="ghost"
							bold={false}
							value={field.value ?? ''}
							onChangeText={field.onChange}
							// The draft reaches the form as it is typed: a footer action or a dismissal
							// on native does not blur the editor, and must not read the previous value.
							onChangeDraft={field.onChange}
							placeholder={props.placeholder}
							startEditing={props.autoFocus}
							testID={props.testID}
						/>
					)}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

/**
 * A compound fact: its key row (closed: one line, or the derived value) and, open, its parts as
 * indented rows; there is no close verb. `mark`: its root's Saved mark replaces its verbs.
 */
function AddressRows(props: {
	testID: string;
	prefix: 'billing' | 'shipping';
	labels: Record<string, string>;
	open: boolean;
	onOpen: () => void;
	autoFocus?: boolean;
	derived?: string;
	verbs: Verb[];
	input?: boolean;
	mark?: boolean;
	parts?: readonly string[];
}) {
	const { testID, prefix, labels } = props;
	const t = useT();
	const countries = useCountries();
	const marked = useSavedName() === prefix && props.mark;
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
				testID={`${testID}-row-${prefix}`}
				label={labels[prefix]}
				trailing={
					marked ? (
						<SavedMark name={prefix} label={t('settings.saved')} />
					) : (
						props.verbs.map((item) => verb(testID, item))
					)
				}
			>
				{props.open ? null : props.derived ? (
					<Text className="text-muted-foreground">{props.derived}</Text>
				) : (
					<Text onPress={props.onOpen}>{line}</Text>
				)}
			</PropertyRow>
			{props.open &&
				(props.parts ?? (prefix === 'billing' ? ADDRESS_PARTS : SHIPPING_PARTS)).map((part) => (
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
								autoFocus={props.autoFocus && part === 'address_1'}
								input={props.input}
								testID={`${testID}-field-${prefix}-${part}`}
							/>
						)}
					</PropertyRow>
				))}
		</>
	);
}
