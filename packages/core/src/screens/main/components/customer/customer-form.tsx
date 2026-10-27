import * as React from 'react';

import * as z from 'zod';

import { Form, SavedMark, useSavedName } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { DialogBody, DialogFooter, type DialogFooterProps } from '@wcpos/components/dialog';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
	PropertyVerb,
} from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import {
	ADDRESS_FACTS,
	asShipping,
	BILLING_PARTS,
	shipsToBilling,
	TextPart,
	useAddressFacts,
} from './address-rows';
import { TAX_ID_DEFAULT_ROW, TaxIdsForm, taxIdsFormSchema } from './tax-ids-form';
import { CountriesProvider } from '../../../../contexts/countries';
import { useT } from '../../../../contexts/translations';
import { billingAddressSchema } from '../billing-address-form';
import { FormErrors } from '../form-errors';
import { META_DATA_DEFAULT_ROW, MetaDataForm, metaDataSchema } from '../meta-data-form';
import { shippingAddressSchema } from '../shipping-address-form';
import { useFieldPresence } from '../use-field-presence';

/**
 *
 */
export const customerFormSchema = z.object({
	first_name: z.string().optional(),
	last_name: z.string().optional(),
	email: z.string().email(),
	role: z.string().optional(),
	username: z.string().optional(),
	password: z.string().default(''), // WC REST API will error if password is not provided on create
	tax_id: z.string().optional(),
	...billingAddressSchema.shape,
	...shippingAddressSchema.shape,
	meta_data: metaDataSchema,
	tax_ids: taxIdsFormSchema,
});

/**
 *
 */
export type CustomerFormValues = z.infer<typeof customerFormSchema>;

/**
 * Billing identity filled from the top-level fields when empty (ledger line 3); the creation
 * screens apply it on submit. A shipping that follows billing (empty or billing's copy) is stored
 * as the filled billing's copy, Woo's "ship to billing"; an own shipping is kept.
 */
export function fillBillingFromIdentity(data: CustomerFormValues): CustomerFormValues {
	const billing = {
		...data.billing,
		first_name: data.billing?.first_name || data.first_name || '',
		last_name: data.billing?.last_name || data.last_name || '',
		email: data.billing?.email || data.email || '',
	};
	const follows = shipsToBilling(data.shipping, data.billing);
	return { ...data, billing, shipping: follows ? asShipping(billing) : data.shipping };
}

interface CustomerFormProps {
	form: ReturnType<typeof import('react-hook-form').useForm<z.infer<typeof customerFormSchema>>>;
	footer: DialogFooterProps;
	renderLayout?: (body: React.ReactNode, footer: React.ReactNode) => React.ReactNode;
	/** The Shipping row's link ("Same as billing"), for a writer that derives shipping from it. */
	onShippingLink?: (linked: boolean) => void;
}

/** The offered facts in canonical order after the asked ones; Tax ID and Custom field follow. */
const OFFERED = [...ADDRESS_FACTS, { name: 'password' }] as const;
/** The lists (rows + add): the add button appends one empty row. */
const LISTS = [
	['tax_ids', 'tax_id.tax_id', TAX_ID_DEFAULT_ROW],
	['meta_data', 'common.custom_field', META_DATA_DEFAULT_ROW],
] as const;
type RowOptions = { field?: string; marks?: string[]; verb?: React.ReactNode; input?: boolean };

/**
 * A customer as property rows. A creation form is typed into; an edit (the record has an id,
 * ledger line 2) shows values at rest that the modal autosaves, with Username and Role locked.
 */
export function CustomerForm(props: CustomerFormProps) {
	const { form, footer, renderLayout, onShippingLink } = props;
	const t = useT();
	const saved = useSavedName();
	const editing = !!(form.getValues() as Record<string, unknown>).id;
	const { focus, ...address } = useAddressFacts(form, 'customer');
	// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- The writer's ref, not parent state.
	React.useEffect(() => onShippingLink?.(address.linked), [address.linked, onShippingLink]);
	const presence = useFieldPresence(
		OFFERED,
		(name) => (name === 'password' ? !form.getValues('password') : address.isEmpty(name)),
		(name) => (name === 'password' ? form.setValue('password', '') : address.clear(name))
	);
	const has = (name: string) => presence.present.includes(name as never);
	const labels: Record<string, string> = { ...address.labels, password: t('common.password') };
	const { offered, rows } = address.layout(presence, {
		input: !editing,
		billingMark: true,
		billingParts: BILLING_PARTS,
	});
	const append = (name: 'tax_ids' | 'meta_data', row: object) =>
		form.setValue(name, [...(form.getValues(name) ?? []), row] as never);
	const removeVerb = (name: (typeof OFFERED)[number]['name']) => (
		<PropertyVerb testID={`customer-remove-${name}`} onPress={() => presence.withdraw(name)}>
			{t('common.remove')}
		</PropertyVerb>
	);
	/** One fact; its verb hides while one of its Saved marks shows, `field` names its control. */
	const row = (id: string, label: string, value: React.ReactNode, o: RowOptions = {}) => {
		const mark = (o.marks ?? [id]).find((name) => name === saved);
		return (
			<PropertyRow
				testID={`customer-row-${id}`}
				label={label}
				nativeID={o.field && `${o.field.replace('.', '-')}-form-item`}
				trailing={mark ? <SavedMark name={mark} label={t('settings.saved')} /> : o.verb}
			>
				{value}
			</PropertyRow>
		);
	};
	/** A text part; its id (`customer-first-name-input`) is the field's, billing's prefix dropped. */
	const part = (field: string, placeholder: string, input = !editing) => {
		const id = field.replace('billing.', '');
		return (
			<TextPart
				key={id}
				name={field}
				placeholder={placeholder}
				input={input}
				autoFocus={focus === id}
				secureTextEntry={id === 'password'}
				testID={`customer-${id.replace('_', '-')}-input`}
			/>
		);
	};
	const textRow = (field: string, label: string, o: RowOptions = {}) => {
		const value = part(field, t('common.add_value', { label }), o.input);
		return row(field.replace('billing.', ''), label, value, { field, ...o });
	};
	// Set elsewhere is locked: the value and where it is set (property rows rule 6).
	const locked = (id: 'username' | 'role', label: string, where: string) =>
		row(id, label, String(form.getValues(id) ?? ''), {
			verb: <Text className="text-muted-foreground text-sm">{where}</Text>,
		});

	const body = (
		<Form {...form}>
			<CountriesProvider>
				<VStack className="gap-4">
					<FormErrors />
					<PropertyList testID="customer-form">
						{row(
							'name',
							t('common.name'),
							<HStack className="gap-2">
								{part('first_name', labels.first_name)}
								{part('last_name', labels.last_name)}
							</HStack>,
							{ field: 'first_name', marks: ['first_name', 'last_name'] }
						)}
						{textRow('email', labels.email)}
						{/* Billing's Saved mark sits on its address row, or here while that is not a row. */}
						{textRow('billing.phone', labels.phone, { marks: has('billing') ? [] : ['billing'] })}
						{editing
							? locked('username', t('common.username'), t('customers.set_at_creation'))
							: textRow('username', t('common.username'))}
						{editing && locked('role', t('common.role'), t('customers.set_in_wordpress'))}
						{has('company') &&
							textRow('billing.company', labels.company, { verb: removeVerb('company') })}
						{rows}
						{has('password') &&
							textRow('password', labels.password, { input: true, verb: removeVerb('password') })}
						<TaxIdsForm testID="customer" />
						<MetaDataForm testID="customer" />
						<PropertyAddRow>
							{offered.map((name) => (
								<PropertyAdd
									key={name}
									// The perf spec presses Billing address by this id to open its parts.
									testID={
										name === 'billing' ? 'customer-billing-address-toggle' : `customer-add-${name}`
									}
									label={labels[name]}
									onPress={() => {
										presence.add(name);
										address.added(name);
									}}
								/>
							))}
							{LISTS.map(([name, label, row]) => (
								<PropertyAdd
									key={name}
									testID={`customer-add-${name === 'tax_ids' ? 'tax_id' : name}`}
									label={t(label)}
									onPress={() => append(name, row)}
								/>
							))}
						</PropertyAddRow>
					</PropertyList>
				</VStack>
			</CountriesProvider>
		</Form>
	);
	const footerElement = <DialogFooter {...footer} />;

	if (renderLayout) return renderLayout(body, footerElement);
	return (
		<>
			<DialogBody>{body}</DialogBody>
			{footerElement}
		</>
	);
}
