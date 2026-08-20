import toNumber from 'lodash/toNumber';

import { isGuestCustomer } from '@wcpos/sync-core';

import { extractNameFromJSON } from '../../../hooks/use-customer-name-format/helpers';

import type { CustomerData } from '../../../hooks/use-customer-name-format/helpers';

export function normalizeSelectedCustomerID(rawCustomerID: string | number | null | undefined) {
	if (rawCustomerID === null || rawCustomerID === undefined || rawCustomerID === '') {
		return undefined;
	}

	const normalizedCustomerID = toNumber(rawCustomerID);
	return Number.isFinite(normalizedCustomerID) ? normalizedCustomerID : undefined;
}

export function isIdOnlyCustomerEntity(entity: CustomerData | null | undefined): boolean {
	if (!entity) return false;
	return !!entity.id && !extractNameFromJSON(entity);
}

interface ResolveCustomerPillEntityArgs {
	customer: CustomerData | null | undefined;
	selectedCustomer: CustomerData | null | undefined;
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

	if (customer && (isGuestCustomer(customer.id) || !isIdOnlyCustomerEntity(customer))) {
		return customer;
	}

	if (selectedCustomer?.id === customerID) {
		return selectedCustomer;
	}

	return customer ?? null;
}
