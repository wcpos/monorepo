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

/**
 * How long a link may wait for its customer's id or its records. A missing
 * order or customer is not proof the link is dead: a journal reset or resync
 * removes residents with no pending work and pulls them back later. So a link
 * waits through that, and so does one whose customer the store refused until
 * it is sent again. A month is far beyond any offline stretch or resend a
 * cashier would make, and keeps a journal nobody settles from growing forever.
 */
export const CUSTOMER_LINK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Order statuses that mean the sale was voided. Linking a customer to one is
 * pointless, and writing to it must never look like the cashier undoing the void.
 */
const VOIDED_ORDER_STATUSES = new Set(['cancelled', 'trash']);

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
	/** The link no longer applies (voided, cashier moved on, already stamped, expired). */
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
	/**
	 * True when the order has a delete in the write queue, whatever its state: a
	 * void waiting to send, one in flight, or one the store refused.
	 */
	orderHasQueuedDelete(orderUuid: string): Promise<boolean>;
	/** Write `customer_id` through the normal order mutation path. False when the write failed. */
	stampCustomer(document: unknown, customerId: number): Promise<boolean>;
	/** Serialise with the cart's own writes to this order (the template-to-resident birth). */
	serializeOrder<T>(orderUuid: string, run: () => Promise<T>): Promise<T>;
	drop(orderUuid: string, expectAt: string): Promise<void>;
	now(): number;
}

/**
 * Settle one link. Idempotent: the stamp is an absolute `customer_id`, so a
 * replay after a crash between the stamp and the drop writes the same value
 * again, and a replay after the drop finds nothing to do.
 *
 * The stamp is an ordinary, non-explicit order update enqueued after the
 * customer's ack, so it lands behind anything already queued for the order.
 * While the order is `pos-open` the open-cart hold keeps it back on purpose,
 * even after the checkout push; it rides the next explicit push, and every
 * online payment makes one before any money moves (`persistSaleProvenance`:
 * "Online provenance must reach the store BEFORE payment"). An offline payment
 * rides the order write that moves the order off `pos-open`. Once the order is
 * paid, the stamp is a follow-up update that sets `customer_id` on the server copy.
 *
 * The stamp never writes to an order that is being voided. A delete in the
 * queue would absorb the stamp and turn into an update, which resurrects the
 * sale the cashier voided; queued behind a delete already sent, the stamp
 * would dead-letter. A voided status is the store's own void. Either way the
 * link is dropped without a write.
 *
 * A missing order or customer waits rather than drops: a journal reset or
 * resync removes residents and pulls them back later. A resident that never
 * returns (a void the store acknowledged, a customer create discarded from
 * Store health) leaves a link that expires after `CUSTOMER_LINK_LIFETIME_MS`.
 *
 * `rejected` means the store refused one of this customer's writes. If the
 * customer still has no id, it was the create: the order keeps the copied
 * addresses as a guest and never carries a local id. The link stays until the
 * customer is sent again (and stamped), or until it expires.
 */
export async function reconcileCustomerLink(
	deps: CustomerLinkDeps,
	orderUuid: string,
	link: CustomerLink,
	options: { rejected?: boolean } = {}
): Promise<CustomerLinkOutcome> {
	if (deps.activeScopeId() !== link.scopeId) return 'waiting';
	if (deps.now() - Date.parse(link.at) > CUSTOMER_LINK_LIFETIME_MS) {
		await deps.drop(orderUuid, link.at);
		return 'dropped';
	}
	const customer = await deps.findCustomer(link.customerUuid);
	if (!customer) return 'waiting';
	if (customer.remoteId === null) return options.rejected ? 'rejected' : 'waiting';
	const customerId = customer.remoteId;
	return deps.serializeOrder(orderUuid, async () => {
		const order = await deps.findOrder(orderUuid);
		if (!order) return 'waiting';
		const current = order.payload.customer_id as number | null | undefined;
		const guest = current == null || isGuestCustomer(current);
		if (
			!guest ||
			!sameIdentity(customerLinkIdentity(order.payload.billing), link.identity) ||
			VOIDED_ORDER_STATUSES.has(order.payload.status as string)
		) {
			await deps.drop(orderUuid, link.at);
			return 'dropped';
		}
		// Read last, right before the write, so a void made meanwhile is seen.
		if (await deps.orderHasQueuedDelete(orderUuid)) {
			await deps.drop(orderUuid, link.at);
			return 'dropped';
		}
		if (!(await deps.stampCustomer(order.document, customerId))) return 'waiting';
		await deps.drop(orderUuid, link.at);
		return 'stamped';
	});
}
