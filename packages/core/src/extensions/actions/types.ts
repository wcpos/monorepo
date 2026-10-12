import type { PaymentMethodDescriptor } from '@wcpos/order-math';

export const ACTION_API_VERSION = 1;
/**
 * Named for the checkout code, which the Logs event-label check scans for dotted literals
 * (`scripts/check-event-labels.mjs`, roots include `pos/checkout`). An action event or a hook
 * id is not a log row and has no merchant label, so checkout refers to these constants.
 */
export const TENDER_COMMIT_EVENT = 'checkout.tender.commit' as const satisfies ActionEvent;
export const CHECKOUT_COMPLETE_EVENT = 'checkout.complete' as const satisfies ActionEvent;
export const ORDER_VOID_EVENT = 'cart.order.void' as const satisfies ActionEvent;
/** The guard a void must have registered; the dispatch refuses without it. */
export const ORDER_VOID_GUARD_IDS = ['payments.gate'] as const;
/** Closed list for v1. */
export const ACTION_EVENTS = [
	'cart.line.add',
	'cart.line.update',
	'cart.line.remove',
	'cart.coupon.apply',
	'cart.coupon.remove',
	'cart.customer.set',
	ORDER_VOID_EVENT,
	TENDER_COMMIT_EVENT,
	CHECKOUT_COMPLETE_EVENT,
] as const satisfies readonly ActionEvent[];
// `satisfies readonly ActionEvent[]` admits a short list; this line refuses one.
type MissingFromActionEvents = Exclude<ActionEvent, (typeof ACTION_EVENTS)[number]>;
export const ACTION_EVENTS_COMPLETE: MissingFromActionEvents extends never ? true : never = true;
/** The guards a tender commit must have registered; the dispatch refuses without them. */
export const TENDER_GUARD_IDS = ['register.gate', 'session.gate'] as const;
export type ActionEvent = keyof ActionContracts;
export type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type PlainLine = Record<string, unknown>;
/**
 * Mirrors `SaleOutcome['source']` in `pos/checkout/sale-completion.ts`; the primitive does not
 * import from a consumer. The dispatch in `completeSale` passes `outcome.source`, so a drift is a
 * type error there.
 */
export type SaleCompletionSource =
	| 'manual'
	| 'terminal'
	| 'gateway'
	| 'gateway-settled'
	| 'gateway-contract'
	| 'gateway-snapshot'
	| 'zero-balance'
	| 'replay';
export interface ActionContracts {
	'checkout.complete': {
		payload: {
			source: SaleCompletionSource;
			presentation: 'stage' | 'modal' | 'background';
			actor: { id: string; name: string } | null;
		};
		result: {
			outcome: 'completed' | 'partial' | 'not-completed' | 'sent';
			/** Only when completed: what the audit row needs, read AFTER the reconcile. */
			summary: {
				orderId: number | null;
				orderUUID: string;
				orderNumber: string | null;
				total: string | null;
				paymentLegs: number;
			} | null;
		};
	};
	'checkout.tender.commit': {
		payload: {
			methodId: string | null;
			mode: 'manual' | 'server' | 'device' | 'zero-balance' | string | null;
			amountMinor: number;
			tenderedMinor: number;
			balanceMinor: number;
			/** What a rounding hook added to (or took off) the balance; callers pass `0`. */
			roundingMinor: number;
			/** The caller's view before the chain; the gate and the writer judge `amountMinor === balanceMinor`. */
			completing: boolean;
			bindingStatus: 'bound' | 'choose' | 'none';
			registerId: string | null;
			sessionId: string | null;
		};
		result: unknown;
	};
	'cart.line.add': {
		payload: { type: CartLineType; line: PlainLine; lineItems: PlainLine[] };
		result: unknown;
	};
	'cart.line.update': {
		payload: {
			/** The list the line sits in; fee and shipping edits dispatch this event too. */
			type: CartLineType;
			lineUuid: string;
			changes: PlainLine;
			line: PlainLine | null;
			/** The order's product lines, whatever `type` is: what a stock or pricing hook reads. */
			lineItems: PlainLine[];
			options: { skipStockGuard?: boolean };
		};
		result: unknown;
	};
	'cart.line.remove': {
		payload: {
			type: CartLineType;
			lineUuid: string;
			/** The line as it is about to leave; `null` when the uuid is no longer in the order. */
			line: PlainLine | null;
			lineItems: PlainLine[];
		};
		result: unknown;
	};
	'cart.coupon.apply': {
		payload: {
			/** The entering line: a catalog coupon, or a quick discount carrying its intent meta. */
			couponLine: PlainLine;
			lineItems: PlainLine[];
			/** The coupon lines already on the order. */
			couponLines: PlainLine[];
		};
		result: unknown;
	};
	'cart.coupon.remove': {
		payload: {
			code: string;
			couponLine: PlainLine;
			lineItems: PlainLine[];
			couponLines: PlainLine[];
		};
		result: unknown;
	};
	'cart.customer.set': {
		payload: {
			customerId: number;
			previousCustomerId: number | null;
			/** `null` when the caller supplied no address; the write then leaves the field absent. */
			billing: PlainLine | null;
			shipping: PlainLine | null;
			/** The order's tax-id snapshot; `null` means the write leaves the current one alone. */
			taxIds: PlainLine[] | null;
		};
		result: unknown;
	};
	'cart.order.void': {
		payload: {
			orderId: number | null;
			orderNumber: string | null;
			status: string;
			registerId: string | null;
			sessionId: string | null;
			/** The cashier, for the audit row (as `checkout.complete` carries it). */
			actor: { id: string; name: string } | null;
			/**
			 * The payments ledger as counted once by the dispatcher inside its queue slot; a guard
			 * never reads a document. `live` = pending or authorized rows, `captured` = captured rows,
			 * `device` = how many of those were taken on a card reader (Cancel settles them through it).
			 */
			paymentLegs: { live: number; captured: number; device: number };
		};
		/** The writer's answer; a `removed` may still be converted by a late store refusal. */
		result: { kind: 'removed' | 'kept-pending' };
	};
}
/** Every other payload key is restored by the dispatcher. */
export const REWRITABLE_PAYLOAD_KEYS = {
	[CHECKOUT_COMPLETE_EVENT]: [],
	'cart.line.add': ['line'],
	'cart.line.update': ['changes'],
	'cart.line.remove': [],
	// The discount is recalculated by the writer from the line it is handed; a consumer that wants
	// to rewrite a coupon line first makes the recalculation read the payload.
	'cart.coupon.apply': [],
	'cart.coupon.remove': [],
	'cart.customer.set': ['billing', 'shipping', 'taxIds'],
	[ORDER_VOID_EVENT]: [],
	// The handler derives the split, provenance and completion facts from the payload after the
	// chain, so the amounts are rewritable (cash rounding, #66 and #84).
	'checkout.tender.commit': [
		'amountMinor',
		'balanceMinor',
		'roundingMinor',
		'registerId',
		'sessionId',
	],
} as const satisfies Record<ActionEvent, readonly string[]>;
export type ActionActor = {
	userId: number | null;
	registerId: string | null;
	sessionId: string | null;
};
export type ActionSource = 'user' | 'replay' | 'system';
export type ActionEventInput<E extends ActionEvent> = {
	readonly event: E;
	readonly orderId: string;
	readonly actor: ActionActor;
	readonly source: ActionSource;
	readonly payload: ActionContracts[E]['payload'];
};
export type ActionResult<E extends ActionEvent> = ActionContracts[E]['result'];
export type ActionRefusal = {
	deny: {
		reasonKey: string;
		params?: Record<string, string | number>;
		detail?: Record<string, unknown>;
		/** Set by a hook that has already shown the reason (a toast of its own); the caller then shows nothing. */
		presented?: boolean;
	};
};
export function isActionRefusal(value: unknown): value is ActionRefusal {
	return (
		!!value &&
		typeof value === 'object' &&
		'deny' in value &&
		!!value.deny &&
		typeof value.deny === 'object' &&
		'reasonKey' in value.deny &&
		typeof value.deny.reasonKey === 'string'
	);
}
export type ActionHookTier = 'guard' | 'extension';
export type ActionNext<E extends ActionEvent> = (
	e: ActionEventInput<E>
) => Promise<ActionResult<E>>;
export type ActionHook<E extends ActionEvent> = (
	ctx: ActionContext,
	e: ActionEventInput<E>,
	next: ActionNext<E>
) => Promise<ActionResult<E> | ActionRefusal>;
export interface ActionContext {
	/**
	 * The app's logger. `options` are the logger's own (showToast, toast, context); `category`
	 * names the row's category (`['wcpos', 'pos', 'cart', 'stock']`) so a hook that replaces code
	 * keeps that code's rows where the logs screen already files them; default `wcpos.pos.actions`.
	 */
	readonly log: (
		level: 'debug' | 'info' | 'warn' | 'error',
		message: string,
		options?: Record<string, unknown> & { category?: readonly string[] }
	) => void;
	readonly t: (key: string, params?: Record<string, string | number>) => string;
	readonly now: () => number;
	readonly read: {
		readonly catalog: (
			kind: 'product' | 'variation',
			wooId: number
		) => Promise<Record<string, unknown> | null>;
		/** The till's descriptor for a payment method, or null when the till does not offer it. */
		readonly paymentMethod: (id: string) => PaymentMethodDescriptor | null;
	};
	readonly register: {
		/** The bound register and its open session, or throws RegisterSessionRequiredError. */
		resolveSession(): Promise<{ registerId: string | null; sessionId: string | null }>;
	};
	/** `priceDecimals` is what every `*Minor` amount in a payload is counted in. */
	readonly store: { readonly preventOverselling: boolean; readonly priceDecimals: number };
}
export type ActionHookRegistration = { id: string; tier: ActionHookTier; order?: number };
export type ActionHookState = { strikes: number; disabled: boolean };
