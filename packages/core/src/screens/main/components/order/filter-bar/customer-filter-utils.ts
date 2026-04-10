import toNumber from 'lodash/toNumber';

import type { CustomerDocument } from '@wcpos/database';

import { extractNameFromJSON } from '../../../hooks/use-customer-name-format/helpers';

export function normalizeSelectedCustomerID(rawCustomerID: string | number | null | undefined) {
	if (rawCustomerID === null || rawCustomerID === undefined || rawCustomerID === '') {
		return undefined;
	}

	const normalizedCustomerID = toNumber(rawCustomerID);
	return Number.isFinite(normalizedCustomerID) ? normalizedCustomerID : undefined;
}

interface ResolveCustomerPillEntityArgs {
	customer: CustomerDocument | null | undefined;
	selectedCustomer: CustomerDocument | null | undefined;
	customerID?: number;
	isActive: boolean;
}

export function resolveCustomerPillEntity({
	customer,
	selectedCustomer,
	customerID,
	isActive,
}: ResolveCustomerPillEntityArgs) {
	if (!isActive) {
		return null;
	}

	if (customer && (customer.id === 0 || !!extractNameFromJSON(customer))) {
		return customer;
	}

	if (selectedCustomer?.id === customerID) {
		return selectedCustomer;
	}

	return customer ?? null;
}
