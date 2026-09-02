/**
 * Payments contract — types that encode the DECISIONS on the payments-contract map
 * (wcpos/roadmap#97): #102 language, #103 ledger, #104 descriptor, #107 cashier rules.
 * Throwaway prototype for wayfinder #110. Nothing here is app code.
 *
 * Fields marked `EXTRA` are not in any resolution — each is a finding in FINDINGS.md.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Major units (92.95). The wire form is undecided — Woo uses decimal strings. */
export type Money = number;
export type GatewayId = string; // e.g. 'pos_cash', 'stripe_terminal'
export type PaymentId = string; // client-minted UUID v4, minted at tender time (#103.2)
export type ProviderId = string; // open in the descriptor; closed per app build (#104)
export type IsoDate = string;

/** Drivers compiled into THIS app build. A descriptor naming any other provider is
 *  shown disabled-with-reason (#104 "Driver switch-on"). */
export type KnownDriverProvider = 'stripe' | 'square' | 'sumup';

// ---------------------------------------------------------------------------
// Descriptor (#104)
// ---------------------------------------------------------------------------

/** Closed axis: reports, the payment-method filter, drawer logic. */
export type Kind = 'cash' | 'card' | 'stored_value' | 'bank_transfer' | 'other';

/** Open axis: the app's flow. Free implements `manual`; Pro registers the rest.
 *  Unknown mode → disabled-with-reason, never hidden. */
export type CaptureMode = 'manual' | 'webview' | 'server' | 'device' | 'stored_value';

export interface Hardware {
	transports: ('bluetooth' | 'usb' | 'network' | 'tap_to_pay')[];
	discovery: 'sdk' | 'manual';
}

export type Capture =
	| { mode: 'manual' }
	| { mode: 'webview' } // the extension owns the flow; Free passes through
	| { mode: 'server'; provider: ProviderId } // plugin drives the reader; app polls
	| { mode: 'device'; provider: ProviderId; hardware: Hardware } // app driver collects+confirms
	| { mode: 'stored_value'; provider: ProviderId }; // server validates + redeems a code

export interface Capabilities {
	amount: { partial: boolean; min?: Money; max?: Money };
	change: boolean;
	refunds: { via: 'provider' | 'manual' | 'none'; partial: boolean };
	tips: 'none' | 'on_reader' | 'at_till';
	offline: 'record' | 'queue' | 'none';
	void: boolean;
}

export interface Defaults {
	order_status: string; // Woo status slug the order takes when ledger = total
	rounding: { increment: Money; mode: 'nearest' | 'up' | 'down' } | null; // placement only
	open_drawer: boolean;
}

export interface PaymentMethodDescriptor {
	schema: 1;
	id: GatewayId; // = the gateway id (#102: one gateway per method)
	title: string;
	enabled: boolean;
	order: number;
	kind: Kind;
	capture: Capture;
	capabilities: Capabilities;
	defaults: Defaults;
	/** Gateway also works on the order-pay page, so it appears in the legacy tab too. */
	webview_available: boolean;
}

// ---------------------------------------------------------------------------
// Ledger row (#103) — `_wcpos_payments[]` on ONE Woo order
// ---------------------------------------------------------------------------

/** Lifecycle ONLY. Refund state is `refunded_amount`, never a status (#103.5). */
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'voided';

export interface Payment {
	id: PaymentId;
	method: GatewayId; // also written to the multi-valued `_wcpos_payment_method` index meta
	amount: Money; // applied to the order (#107.2)
	/** Cash pair (#107.2): handed over; change = tendered − amount. Only meaningful when the
	 *  method has `change: true` — but the ROW has no discriminator to enforce that. */
	tendered?: Money;
	status: PaymentStatus;
	refunded_amount: Money; // rollup derived from RefundAllocation[]
	/** EXTRA: the mode the row was taken under. The route handler dispatch is per mode, and
	 *  the row is the idempotency key — so the row must remember it (see FINDINGS). */
	capture_mode: CaptureMode;
	/** EXTRA: nothing else marks an offline row now that every id is client-minted. */
	recorded_offline: boolean;
	/** Provider references and receipt fields as one opaque bag (prior art #98). */
	provider?: {
		name: ProviderId;
		refs: Record<string, string | null>; // null = not yet known (Stripe offline PI)
		receipt?: Record<string, string>; // EMV fields, last4, brand, auth code…
	};
	created_at: IsoDate;
	captured_at?: IsoDate;
}

/** The durable truth: `_wcpos_payments` order meta. */
export interface OrderLedger {
	schema: 1;
	payments: Payment[];
}

// ---------------------------------------------------------------------------
// Refunds (#103.5, #107.4) — a normal Woo `shop_order_refund` child + allocations
// ---------------------------------------------------------------------------

export interface RefundAllocation {
	payment_id: PaymentId;
	amount: Money;
	/** EXTRA: outcome of driving the provider leg ("recorded on the row" — which row?). */
	via: 'provider' | 'manual';
	status: 'pending' | 'succeeded' | 'failed';
	provider_ref?: string | null; // e.g. Stripe `re_…`
}

export interface WooRefund {
	refund_id: number; // the `shop_order_refund` post/HPOS id
	amount: Money;
	_wcpos_refund_allocations: RefundAllocation[];
}

// ---------------------------------------------------------------------------
// Capture flows as discriminated unions — the free plugin's route family (#104)
// ---------------------------------------------------------------------------

export type Route =
	| 'POST orders/{id}/payments' // record (all `manual` needs)
	| 'POST orders/{id}/payments/{uuid}/bootstrap'
	| 'POST orders/{id}/payments/{uuid}/intent'
	| 'POST orders/{id}/payments/{uuid}/capture'
	| 'GET orders/{id}/payments/{uuid}/status'
	| 'POST orders/{id}/payments/{uuid}/void';

export type Side = 'app' | 'server' | 'device' | 'provider' | 'extension';

interface Step<M extends CaptureMode, S extends string> {
	mode: M;
	step: S;
	side: Side;
	route?: Route; // omitted = no wcpos route is hit for this step
	then: PaymentStatus; // row status after the step
	note?: string;
}

export type FlowEvent =
	| Step<'manual', 'record'>
	| Step<'manual', 'sync'>
	| Step<'webview', 'open_order_pay'>
	| Step<'webview', 'gateway_process_payment'>
	| Step<'webview', 'passthrough_writes_row'>
	| Step<'server', 'intent'>
	| Step<'server', 'poll'>
	| Step<'server', 'capture'>
	| Step<'device', 'bootstrap'>
	| Step<'device', 'intent'>
	| Step<'device', 'collect_and_confirm'>
	| Step<'device', 'capture'>
	| Step<'device', 'forwarded'>
	| Step<'stored_value', 'validate'>
	| Step<'stored_value', 'redeem'>
	| Step<CaptureMode, 'void'>;

// ---------------------------------------------------------------------------
// Derived order-level view (#103.4, #103.7, #107.1–2, #107.5)
// ---------------------------------------------------------------------------

export type PosOrderStatus = 'pos-open' | 'pos-partial' | (string & {});

export interface DerivedOrderView {
	paid: Money; // sum of legs counted toward the balance
	balance: Money; // total − paid, never negative
	change: Money; // Σ (tendered − amount) over cash legs
	status: PosOrderStatus;
	payment_method: GatewayId | null; // gateway of the LARGEST tender (#103.4)
	payment_method_title: string; // composed, e.g. "Card + Cash"
	_wcpos_payment_method: GatewayId[]; // the multi-valued index meta
}

/** Legs that count toward the balance. `authorized` counts: money is committed on the
 *  device before server capture (Stripe fact #99.3) — #107.1 says "captured"; see FINDINGS. */
const COUNTS_TOWARD_BALANCE: PaymentStatus[] = ['authorized', 'captured'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function derive(
	total: Money,
	ledger: OrderLedger,
	descriptors: Record<GatewayId, PaymentMethodDescriptor>
): DerivedOrderView {
	const live = ledger.payments.filter((p) => COUNTS_TOWARD_BALANCE.includes(p.status));
	const paid = round2(live.reduce((s, p) => s + p.amount, 0));
	const change = round2(
		live.reduce((s, p) => s + Math.max(0, (p.tendered ?? p.amount) - p.amount), 0)
	);
	const largest = [...live].sort((a, b) => b.amount - a.amount)[0]; // tie → first by amount sort: undefined order
	const methods = [...new Set(live.map((p) => p.method))];
	const defaultStatus = largest ? descriptors[largest.method].defaults.order_status : 'pos-open';
	return {
		paid,
		balance: round2(Math.max(0, total - paid)),
		change,
		status: live.length === 0 ? 'pos-open' : paid < total ? 'pos-partial' : defaultStatus,
		payment_method: largest?.method ?? null,
		payment_method_title: methods.map((m) => descriptors[m].title).join(' + '),
		_wcpos_payment_method: methods,
	};
}

/** #107.4 default allocation: fill the most recent capturable leg first. */
export function defaultAllocation(
	amount: Money,
	ledger: OrderLedger,
	descriptors: Record<GatewayId, PaymentMethodDescriptor>
): RefundAllocation[] {
	const out: RefundAllocation[] = [];
	let left = amount;
	const refundable = [...ledger.payments]
		.reverse()
		.filter((p) => p.status === 'captured' && p.amount - p.refunded_amount > 0)
		.filter((p) => descriptors[p.method].capabilities.refunds.via !== 'none');
	for (const p of refundable) {
		if (left <= 0) break;
		const take = round2(Math.min(left, p.amount - p.refunded_amount));
		const via = descriptors[p.method].capabilities.refunds.via as 'provider' | 'manual';
		out.push({ payment_id: p.id, amount: take, via, status: 'pending', provider_ref: null });
		left = round2(left - take);
	}
	return out;
}
