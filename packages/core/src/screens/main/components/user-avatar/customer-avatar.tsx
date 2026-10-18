import * as React from 'react';

import { Avatar, type AvatarProps, getInitials } from '@wcpos/components/avatar';
import { isGuestCustomer, type RemoteId, remoteIdOrNull } from '@wcpos/sync-core';

import { RecordAvatar } from './index';
import { useCollectionQueryHandle, useQueryHandleFields } from '../../../../query';
import {
	type CustomerData,
	extractNameFromJSON,
} from '../../hooks/use-customer-name-format/helpers';

import type { QueryHandle, QueryStateOf } from '../../../../query';

type Size = AvatarProps['size'];

/** The name a customer's initials are drawn from: an email reads by its local part. */
export function getCustomerAvatarName(customer: CustomerData): string {
	return extractNameFromJSON(customer).split('@')[0];
}

/**
 * The name fields only (first/last, then billing, then shipping), never username or email: what
 * decides whether a GUEST order carries a person. A guest with only an email is still the Guest.
 */
function getPersonName(customer: CustomerData): string {
	return extractNameFromJSON({
		first_name: customer.first_name,
		last_name: customer.last_name,
		billing: { first_name: customer.billing?.first_name, last_name: customer.billing?.last_name },
		shipping: customer.shipping,
	});
}

/**
 * A customer's initials: their name, else username, else the local part of their email
 * (`jane.doe@shop.example` must not read as "JA" from the domain's side).
 */
export function getCustomerInitials(customer: CustomerData): string {
	return getInitials(getCustomerAvatarName(customer));
}

/**
 * The Guest (customer id 0, shown as "Guest") is not a person: a generic glyph, neutral, never
 * initials on the accent.
 */
export function GuestAvatar({ size }: { size?: Size }) {
	return <Avatar icon="user" variant="muted" size={size} />;
}

const CUSTOMER_STATE: QueryStateOf<'customers'> = {
	search: '',
	filters: {},
	sort: { field: 'id', direction: 'asc' },
	limit: 1,
};

function CustomerRecordAvatar({
	handle,
	name,
	size,
}: {
	handle: QueryHandle;
	name: string;
	size?: Size;
}) {
	// Not the suspending reader: the initials stand while the record is read, if it is not
	// local, and if the read fails. A picture is decoration; it never holds up the row.
	const snapshot = useQueryHandleFields(handle, []);
	const record = snapshot.ready && !snapshot.error ? snapshot.hits[0]?.record : undefined;
	if (!record) return <Avatar fallback={getInitials(name)} size={size} />;
	const payload = record.payload as CustomerData;
	return (
		<RecordAvatar
			record={record}
			avatarUrl={payload.avatar_url}
			// The order's own name first: it is the one shown beside the avatar.
			name={name || getCustomerAvatarName(payload)}
			size={size}
			recyclingKey={record.uuid}
		/>
	);
}

/** A registered customer: owns the one-record read of their picture. */
function RegisteredCustomerAvatar({
	remoteId,
	name,
	size,
}: {
	remoteId: RemoteId;
	name: string;
	size?: Size;
}) {
	const remoteIds = React.useMemo(() => [remoteId], [remoteId]);
	const handle = useCollectionQueryHandle('customers', CUSTOMER_STATE, { remoteIds });
	return <CustomerRecordAvatar handle={handle} name={name} size={size} />;
}

/**
 * The avatar for an order's customer (`customer_id` plus the order's addresses): the customer
 * record's picture, else the initials of the name shown beside it, on the primary. A guest
 * order that carries a name is a person too (initials, no record to read); the nameless Guest
 * gets the glyph, even when the order carries an email.
 */
export function CustomerAvatar({ customer, size }: { customer: CustomerData; size?: Size }) {
	const customerId = customer.id ?? customer.customer_id;
	const remoteId =
		customerId != null && !isGuestCustomer(customerId) ? remoteIdOrNull(customerId) : null;
	if (remoteId !== null) {
		// A registered customer keeps the username/email fallback.
		const name = getCustomerAvatarName(customer);
		return <RegisteredCustomerAvatar remoteId={remoteId} name={name} size={size} />;
	}
	const personName = getPersonName(customer);
	return personName ? (
		<Avatar fallback={getInitials(personName)} size={size} />
	) : (
		<GuestAvatar size={size} />
	);
}
