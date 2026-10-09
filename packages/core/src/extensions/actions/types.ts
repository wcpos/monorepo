export const ACTION_API_VERSION = 1;
/** Closed list. Checkout completion arrives with its own slice. */
export const ACTION_EVENTS = [
	'cart.line.add',
	'cart.line.update',
	'checkout.tender.commit',
] as const;
export type ActionEvent = (typeof ACTION_EVENTS)[number];
export type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type PlainLine = Record<string, unknown>;
export interface ActionContracts {
	'checkout.tender.commit': {
		payload: {
			methodId: string | null;
			mode: 'manual' | 'server' | 'device' | 'zero-balance' | string | null;
			amountMinor: number;
			tenderedMinor: number;
			balanceMinor: number;
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
			lineUuid: string;
			changes: PlainLine;
			line: PlainLine | null;
			lineItems: PlainLine[];
			options: { skipStockGuard?: boolean };
		};
		result: unknown;
	};
}
/** Every other payload key is restored by the dispatcher. */
export const REWRITABLE_PAYLOAD_KEYS = {
	'cart.line.add': ['line'],
	'cart.line.update': ['changes'],
	// Amounts are not rewritable in v1: the tender's split plan, provenance and completion facts
	// are computed from the cashier's entry before the dispatch, so a rewritten amount would be
	// honoured by some steps and not others. A rounding consumer (#66, #84) refactors the
	// handler to derive everything from the payload first, then opens these keys.
	'checkout.tender.commit': ['registerId', 'sessionId'],
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
	};
	readonly register: {
		/** The bound register and its open session, or throws RegisterSessionRequiredError. */
		resolveSession(): Promise<{ registerId: string | null; sessionId: string | null }>;
	};
	readonly store: { readonly preventOverselling: boolean };
}
export type ActionHookRegistration = { id: string; tier: ActionHookTier; order?: number };
export type ActionHookState = { strikes: number; disabled: boolean };
