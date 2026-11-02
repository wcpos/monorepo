import { ensureLocalDocument, storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * A customer created from the cart, attached to its order before the store has
 * given it an id (#1523).
 *
 * The cart never waits on the network: Save copies the new customer's billing
 * and shipping onto the order at once and leaves `customer_id` at the guest
 * value, because a born-local customer has no Woo id to put there and a local
 * uuid must never reach the server. This journal remembers which order is
 * waiting for which customer, so the id can be stamped on when the customer's
 * create is acknowledged, whether that is seconds later or after a relaunch.
 *
 * It lives in the store database's LOCAL documents, never in the replicated
 * customer or order records: writing local-only state into a replicated record
 * makes the downstream skip the next pulled version (TallyUI #53).
 */

/**
 * The billing identity the attach copied onto the order. The stamp only lands
 * while the order still carries it: a cashier who has since picked another
 * customer, or gone back to a guest, has changed their mind, and the late id
 * must not overwrite that.
 */
export type CustomerLinkIdentity = { first_name: string; last_name: string; email: string };

export type CustomerLink = {
	customerUuid: string;
	/** The engine scope both records live in; another scope's link waits for its own. */
	scopeId: string;
	identity: CustomerLinkIdentity;
	at: string;
};

type Journal = { links: Record<string, CustomerLink> };
const ID = 'cart-customer-links';

/** Remember that `orderUuid` is waiting for `link.customerUuid`'s id. Replaces any earlier link. */
export async function recordCustomerLink(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	link: CustomerLink
): Promise<void> {
	const doc = await ensureLocalDocument<Journal>(storeDB, ID, { links: {} });
	await doc.incrementalModify((data) => {
		data.links[orderUuid] = link;
		return data;
	});
}

/** Forget a link, unless it has been replaced since `expectAt` was read. */
export async function dropCustomerLink(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	expectAt: string
): Promise<void> {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		if (data.links[orderUuid]?.at !== expectAt) return data;
		delete data.links[orderUuid];
		return data;
	});
}

export async function pendingCustomerLinks(
	storeDB: StoreLocalDatabase
): Promise<Record<string, CustomerLink>> {
	return (await storeDatabase(storeDB).getLocal<Journal>(ID))?.toJSON(true).data.links ?? {};
}

/** Emits whenever the journal changes, and once on subscribe. */
export function customerLinkChanges(storeDB: StoreLocalDatabase) {
	return storeDatabase(storeDB).getLocal$<Journal>(ID);
}
