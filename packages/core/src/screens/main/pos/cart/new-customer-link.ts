import { isGuestCustomer } from '@wcpos/sync-core';
import type { StoreDatabase } from '@wcpos/database';

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

async function journal(storeDB: StoreDatabase) {
	const existing = await storeDB.getLocal<Journal>(ID);
	if (existing) return existing;
	try {
		return await storeDB.insertLocal<Journal>(ID, { links: {} });
	} catch (error) {
		// Two first writes can race on the insert. Never replace the winner's links.
		const winner = await storeDB.getLocal<Journal>(ID);
		if (winner) return winner;
		throw error;
	}
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** The identity fields of a billing address, normalised so '' and absent compare equal. */
export function customerLinkIdentity(billing: unknown): CustomerLinkIdentity {
	const source = (billing && typeof billing === 'object' ? billing : {}) as Record<string, unknown>;
	return {
		first_name: text(source.first_name),
		last_name: text(source.last_name),
		email: text(source.email),
	};
}

function sameIdentity(a: CustomerLinkIdentity, b: CustomerLinkIdentity): boolean {
	return a.first_name === b.first_name && a.last_name === b.last_name && a.email === b.email;
}

/** Remember that `orderUuid` is waiting for `link.customerUuid`'s id. Replaces any earlier link. */
export async function recordCustomerLink(
	storeDB: StoreDatabase,
	orderUuid: string,
	link: CustomerLink
): Promise<void> {
	const doc = await journal(storeDB);
	await doc.incrementalModify((data) => {
		data.links[orderUuid] = link;
		return data;
	});
}

/** Forget a link, unless it has been replaced since `expectAt` was read. */
export async function dropCustomerLink(
	storeDB: StoreDatabase,
	orderUuid: string,
	expectAt: string
): Promise<void> {
	const doc = await storeDB.getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		if (data.links[orderUuid]?.at !== expectAt) return data;
		delete data.links[orderUuid];
		return data;
	});
}

export async function pendingCustomerLinks(
	storeDB: StoreDatabase
): Promise<Record<string, CustomerLink>> {
	return (await storeDB.getLocal<Journal>(ID))?.toJSON(true).data.links ?? {};
}

/** Emits whenever the journal changes, and once on subscribe. */
export function customerLinkChanges(storeDB: StoreDatabase) {
	return storeDB.getLocal$<Journal>(ID);
}

export type CustomerLinkOutcome =
	/** The order now carries the customer's Woo id. */
	| 'stamped'
	/** Nothing to do yet: no id, another scope, or a stamp that failed and will be retried. */
	| 'waiting'
	/** The link no longer applies (records gone, cashier moved on, already stamped). */
	| 'dropped'
	/**
	 * The store refused the customer's create. The order stays a guest with the
	 * copied addresses; the link is kept, so a "Send again" from Store health
	 * that succeeds still stamps it.
	 */
	| 'rejected';

export interface CustomerLinkDeps {
	activeScopeId(): string | null;
	/** null when the customer is not resident; `remoteId` null until the create is acknowledged. */
	findCustomer(customerUuid: string): Promise<{ remoteId: number | null } | null>;
	/** The order as the cart holds it: the temporary template before its first line, else the resident. */
	findOrder(
		orderUuid: string
	): Promise<{ document: unknown; payload: Record<string, unknown> } | null>;
	/** Write `customer_id` through the normal order mutation path. False when the write failed. */
	stampCustomer(document: unknown, customerId: number): Promise<boolean>;
	/** Serialise with the cart's own writes to this order (the template-to-resident birth). */
	serializeOrder<T>(orderUuid: string, run: () => Promise<T>): Promise<T>;
	drop(orderUuid: string, expectAt: string): Promise<void>;
}

/**
 * Settle one link. Idempotent: the stamp is an absolute `customer_id`, so a
 * replay after a crash between the stamp and the drop writes the same value
 * again, and a replay after the drop finds nothing to do.
 *
 * The stamp is an ordinary order update enqueued after the customer's ack, so
 * it lands behind anything already queued for the order. While the cart is
 * open the order's writes are held (open-cart hold), and the stamp coalesces
 * into the pending update; if the order was already pushed as a guest, it is a
 * follow-up update that sets `customer_id` on the server copy.
 *
 * `rejected` means the store refused one of this customer's writes. If the
 * customer still has no id, it was the create: the order keeps the copied
 * addresses as a guest and never carries a local id. The link stays until the
 * customer is sent again (and stamped) or discarded (and dropped as gone).
 */
export async function reconcileCustomerLink(
	deps: CustomerLinkDeps,
	orderUuid: string,
	link: CustomerLink,
	options: { rejected?: boolean } = {}
): Promise<CustomerLinkOutcome> {
	if (deps.activeScopeId() !== link.scopeId) return 'waiting';
	const customer = await deps.findCustomer(link.customerUuid);
	if (!customer) {
		// A never-pushed create cancelled by a delete leaves no customer to wait for.
		await deps.drop(orderUuid, link.at);
		return 'dropped';
	}
	if (customer.remoteId === null) return options.rejected ? 'rejected' : 'waiting';
	const customerId = customer.remoteId;
	return deps.serializeOrder(orderUuid, async () => {
		const order = await deps.findOrder(orderUuid);
		if (!order) {
			await deps.drop(orderUuid, link.at);
			return 'dropped';
		}
		const current = order.payload.customer_id as number | null | undefined;
		const guest = current == null || isGuestCustomer(current);
		if (!guest || !sameIdentity(customerLinkIdentity(order.payload.billing), link.identity)) {
			await deps.drop(orderUuid, link.at);
			return 'dropped';
		}
		if (!(await deps.stampCustomer(order.document, customerId))) return 'waiting';
		await deps.drop(orderUuid, link.at);
		return 'stamped';
	});
}
