export const ACTION_API_VERSION = 1;
/** Closed list. The two checkout events arrive with their own slices. */
export const ACTION_EVENTS = ['cart.line.add', 'cart.line.update'] as const;
export type ActionEvent = (typeof ACTION_EVENTS)[number];
export type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines' | 'coupon_lines';
type PlainLine = Record<string, unknown>;
export interface ActionContracts {
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
	readonly log: (
		level: 'debug' | 'info' | 'warn' | 'error',
		message: string,
		options?: Record<string, unknown>
	) => void;
	readonly t: (key: string, params?: Record<string, string | number>) => string;
	readonly now: () => number;
	readonly read: {
		readonly catalog: (
			kind: 'product' | 'variation',
			wooId: number
		) => Promise<Record<string, unknown> | null>;
	};
	readonly store: { readonly preventOverselling: boolean };
}
export type ActionHookRegistration = { id: string; tier: ActionHookTier; order?: number };
export type ActionHookState = { strikes: number; disabled: boolean };
