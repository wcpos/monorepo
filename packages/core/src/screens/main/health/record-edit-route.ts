import { useAppInfo } from '../../../hooks/use-app-info';
import { useUserCapabilities } from '../hooks/use-user-capabilities';

import type { Href } from 'expo-router';
import type { UserCapabilities } from '../hooks/user-capabilities';

/** Edit routes per collection — only collections with an edit surface link out.
 * Shared by the Logs rows and the Database panels so no two surfaces can
 * disagree about where a record is edited. */
export const FIX_ROUTES: Record<string, (uuid: string) => Href> = {
	products: (uuid) => `/(app)/(drawer)/products/(modals)/edit/product/${uuid}`,
	variations: (uuid) => `/(app)/(drawer)/products/(modals)/edit/variation/${uuid}`,
	orders: (uuid) => `/orders/edit/${uuid}`,
	customers: (uuid) => `/customers/edit/${uuid}`,
	coupons: (uuid) => `/coupons/edit/${uuid}`,
};

/** The capability the collection's own row actions check before Edit; orders check none. */
function canEdit(collection: string, caps: UserCapabilities): boolean {
	switch (collection) {
		case 'products':
			return caps.canEditProducts;
		case 'variations':
			return caps.canEditVariations;
		case 'customers':
			return caps.canEditCustomers;
		case 'coupons':
			return caps.canEditCoupons;
		default:
			return true;
	}
}

/**
 * The edit route for a record, or null when this user may not edit it: the
 * same gates the collection screens' row actions apply — Pro (those screens
 * are read-only without it) and the collection's edit capability. The edit
 * screens do not repeat the check, so a link from Logs or Store health that
 * skipped it would let a cashier queue a change the store will refuse.
 */
export function useRecordEditRoute(): (
	collection: string,
	uuid: string | null | undefined
) => Href | null {
	const { license } = useAppInfo();
	const { caps } = useUserCapabilities();
	const isPro = license?.isPro ?? false;
	return (collection, uuid) => {
		if (!uuid || !isPro || !canEdit(collection, caps)) return null;
		return FIX_ROUTES[collection]?.(uuid) ?? null;
	};
}
