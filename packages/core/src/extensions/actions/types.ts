export const ACTION_API_VERSION = 1;
/**
 * Named for the checkout code, which the Logs event-label check scans for dotted literals
 * (`scripts/check-event-labels.mjs`, roots include `pos/checkout`). An action event or a hook
 * id is not a log row and has no merchant label, so checkout refers to these constants.
 */
export const TENDER_COMMIT_EVENT = 'checkout.tender.commit' as const satisfies ActionEvent;
export const CHECKOUT_COMPLETE_EVENT = 'checkout.complete' as const satisfies ActionEvent;
/** Closed list for v1. */
export const ACTION_EVENTS = [
	'cart.line.add',
	'cart.line.update',
	TENDER_COMMIT_EVENT,
	CHECKOUT_COMPLETE_EVENT,
] as const satisfies readonly ActionEvent[];
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
	[CHECKOUT_COMPLETE_EVENT]: [],
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
