/**
 * Six payment scenarios as fixtures against the decided descriptor + ledger (wayfinder #110).
 * Each scenario: a narrative, the descriptor(s), the flow as events, the final ledger rows,
 * and the derived order view. `expect` is what the cashier/wp-admin should see; `derive()`
 * computes it from the rows, so a mismatch is a schema or rule defect (see FINDINGS.md).
 *
 * Run: `npx tsx .claude/prototypes/payments/fixtures.ts` (prints each scenario's derived view).
 */
import {
	defaultAllocation,
	derive,
	type DerivedOrderView,
	type FlowEvent,
	type OrderLedger,
	type Payment,
	type PaymentMethodDescriptor,
	type WooRefund,
} from './types';

// ---------------------------------------------------------------------------
// Descriptors (one per gateway; what the free plugin serves to the till)
// ---------------------------------------------------------------------------

const cash: PaymentMethodDescriptor = {
	schema: 1,
	id: 'pos_cash',
	title: 'Cash',
	enabled: true,
	order: 1,
	kind: 'cash',
	capture: { mode: 'manual' },
	capabilities: {
		amount: { partial: true },
		change: true,
		refunds: { via: 'manual', partial: true },
		tips: 'at_till',
		offline: 'record',
		void: true,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: true },
	webview_available: false,
};

/** ONE Stripe Terminal gateway covers Bluetooth readers AND Tap to Pay — the transport is a
 *  hardware declaration, not a second method. Scenarios 2 and 3 share this descriptor. */
const stripeTerminal: PaymentMethodDescriptor = {
	schema: 1,
	id: 'stripe_terminal',
	title: 'Card',
	enabled: true,
	order: 2,
	kind: 'card',
	capture: {
		mode: 'device',
		provider: 'stripe',
		hardware: { transports: ['bluetooth', 'tap_to_pay'], discovery: 'sdk' },
	},
	capabilities: {
		amount: { partial: true, min: 0.5 },
		change: false,
		refunds: { via: 'provider', partial: true },
		tips: 'on_reader',
		offline: 'queue', // true for a BT reader; FALSE for Tap to Pay on Android (#99.8) — one flag, two answers
		void: true,
	},
	defaults: { order_status: 'processing', rounding: null, open_drawer: false },
	webview_available: false,
};

const giftCard: PaymentMethodDescriptor = {
	schema: 1,
	id: 'pos_gift_card',
	title: 'Gift Card',
	enabled: true,
	order: 0,
	kind: 'stored_value',
	capture: { mode: 'stored_value', provider: 'wcpos_gift_cards' },
	capabilities: {
		amount: { partial: true },
		change: false,
		refunds: { via: 'provider', partial: true },
		tips: 'none',
		offline: 'none',
		void: true,
	},
	defaults: { order_status: 'completed', rounding: null, open_drawer: false },
	webview_available: false,
};

/** A legacy terminal extension: nothing but the order-pay page. Lives in the legacy tab only. */
const legacyEftpos: PaymentMethodDescriptor = {
	schema: 1,
	id: 'eftpos_legacy',
	title: 'EFTPOS (legacy)',
	enabled: true,
	order: 3,
	kind: 'card',
	capture: { mode: 'webview' },
	capabilities: {
		amount: { partial: false },
		change: false,
		refunds: { via: 'manual', partial: false },
		tips: 'none',
		offline: 'none',
		void: false,
	},
	defaults: { order_status: 'processing', rounding: null, open_drawer: false },
	webview_available: true, // tautological for a webview-only method — see FINDINGS
};

const descriptors = Object.fromEntries(
	[cash, stripeTerminal, giftCard, legacyEftpos].map((d) => [d.id, d])
) as Record<string, PaymentMethodDescriptor>;

// ---------------------------------------------------------------------------
// Scenario shape
// ---------------------------------------------------------------------------

interface Scenario {
	name: string;
	total: number;
	events: FlowEvent[];
	ledger: OrderLedger;
	refund?: { woo: WooRefund; default_allocation_matches: boolean };
	expect: Pick<
		DerivedOrderView,
		'balance' | 'change' | 'status' | 'payment_method' | 'payment_method_title'
	>;
}

const row = (p: Omit<Payment, 'refunded_amount' | 'created_at'> & Partial<Payment>): Payment => ({
	refunded_amount: 0,
	created_at: '2026-09-02T10:00:00Z',
	...p,
});

// ---------------------------------------------------------------------------
// 1. Offline cash with change — $42.50 order, customer hands over $50, till is offline
// ---------------------------------------------------------------------------
const s1: Scenario = {
	name: '1. offline cash with change',
	total: 42.5,
	events: [
		{
			mode: 'manual',
			step: 'record',
			side: 'app',
			then: 'captured',
			note: 'offline: row minted on the device; amount=42.50 tendered=50.00; drawer opens; receipt prints',
		},
		{
			mode: 'manual',
			step: 'sync',
			side: 'app',
			route: 'POST orders/{id}/payments',
			then: 'captured',
			note: 'later replay, idempotent on the UUID; order itself may not exist server-side yet',
		},
	],
	ledger: {
		schema: 1,
		payments: [
			row({
				id: 'a1',
				method: 'pos_cash',
				amount: 42.5,
				tendered: 50,
				status: 'captured',
				capture_mode: 'manual',
				recorded_offline: true,
				captured_at: '2026-09-02T10:00:00Z',
			}),
		],
	},
	expect: {
		balance: 0,
		change: 7.5,
		status: 'completed',
		payment_method: 'pos_cash',
		payment_method_title: 'Cash',
	},
};

// ---------------------------------------------------------------------------
// 2. Stripe Bluetooth reader (`device`) — $92.95, first tap declined, second succeeds;
//    gateway configured for manual capture so the server captures after the device confirms
// ---------------------------------------------------------------------------
const s2: Scenario = {
	name: '2. Stripe Bluetooth reader via device mode',
	total: 92.95,
	events: [
		{
			mode: 'device',
			step: 'bootstrap',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/bootstrap',
			then: 'pending',
			note: 'connection token — needed at reader CONNECT, before any payment exists; the route is per-payment',
		},
		{
			mode: 'device',
			step: 'intent',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/intent',
			then: 'pending',
			note: 'PI created server-side with metadata.wcpos_payment_id=b1, capture_method=manual',
		},
		{
			mode: 'device',
			step: 'collect_and_confirm',
			side: 'device',
			then: 'failed',
			note: 'declined (card b1)',
		},
		{
			mode: 'device',
			step: 'intent',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/intent',
			then: 'pending',
			note: 'retry = NEW row b2 (fresh UUID) — or re-run b1? #103.6 says re-run failed legs; lifecycle has no failed→pending',
		},
		{
			mode: 'device',
			step: 'collect_and_confirm',
			side: 'device',
			then: 'authorized',
			note: 'money committed on the reader (PIN etc.); status polled/pushed to the row',
		},
		{
			mode: 'device',
			step: 'capture',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/capture',
			then: 'captured',
		},
	],
	ledger: {
		schema: 1,
		payments: [
			row({
				id: 'b1',
				method: 'stripe_terminal',
				amount: 92.95,
				status: 'failed',
				capture_mode: 'device',
				recorded_offline: false,
				provider: { name: 'stripe', refs: { payment_intent: 'pi_1', reader: 'tmr_bt_01' } },
			}),
			row({
				id: 'b2',
				method: 'stripe_terminal',
				amount: 92.95,
				status: 'captured',
				capture_mode: 'device',
				recorded_offline: false,
				provider: {
					name: 'stripe',
					refs: { payment_intent: 'pi_2', charge: 'ch_2', reader: 'tmr_bt_01' },
					receipt: {
						brand: 'visa',
						last4: '4242',
						application_preferred_name: 'Visa Debit',
						authorization_response_code: '00',
					},
				},
				captured_at: '2026-09-02T10:02:00Z',
			}),
		],
	},
	expect: {
		balance: 0,
		change: 0,
		status: 'processing',
		payment_method: 'stripe_terminal',
		payment_method_title: 'Card',
	},
};

// ---------------------------------------------------------------------------
// 3. Tap to Pay in-app (`device`, transport tap_to_pay) — $18.00, offline (BT-style queue),
//    PI created CLIENT-side so its id is null until forwarded (#99.2, #99.8)
// ---------------------------------------------------------------------------
const s3: Scenario = {
	name: '3. Tap to Pay in-app via device mode (offline, client-created intent)',
	total: 18,
	events: [
		{
			mode: 'device',
			step: 'intent',
			side: 'app',
			then: 'pending',
			note: 'offline → intent MUST be client-created; no wcpos route can be hit; refs.payment_intent=null',
		},
		{
			mode: 'device',
			step: 'collect_and_confirm',
			side: 'device',
			then: 'captured',
			note: 'automatic capture → no server capture step at all; row goes pending→captured on the device',
		},
		{
			mode: 'device',
			step: 'forwarded',
			side: 'provider',
			then: 'captured',
			note: 'onDidForwardPaymentIntent hours later: who writes pi_9 onto row c1 — app via record route, or a webhook?',
		},
		{
			mode: 'manual',
			step: 'sync',
			side: 'app',
			route: 'POST orders/{id}/payments',
			then: 'captured',
			note: 'same replay route as cash — a device-mode row recorded through the manual record route',
		},
	],
	ledger: {
		schema: 1,
		payments: [
			row({
				id: 'c1',
				method: 'stripe_terminal',
				amount: 18,
				status: 'captured',
				capture_mode: 'device',
				recorded_offline: true,
				provider: {
					name: 'stripe',
					refs: { payment_intent: null, reader: null, transport: 'tap_to_pay' },
					receipt: { brand: 'mastercard', last4: '0005' },
				},
				captured_at: '2026-09-02T10:05:00Z',
			}),
		],
	},
	expect: {
		balance: 0,
		change: 0,
		status: 'processing',
		payment_method: 'stripe_terminal',
		payment_method_title: 'Card',
	},
};

// ---------------------------------------------------------------------------
// 4. Gift card partial (`stored_value`) + card remainder — $92.95; $60 on the card balance,
//    stored value first by default (#107.3); the gift card is the LARGEST tender
// ---------------------------------------------------------------------------
const s4: Scenario = {
	name: '4. gift card partial + card remainder',
	total: 92.95,
	events: [
		{
			mode: 'stored_value',
			step: 'validate',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/intent',
			then: 'pending',
			note: 'code entered; server reports balance 60.00 < 92.95 → leg amount capped at 60 (cashier can edit down)',
		},
		{
			mode: 'stored_value',
			step: 'redeem',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/capture',
			then: 'captured',
		},
		{
			mode: 'device',
			step: 'intent',
			side: 'server',
			route: 'POST orders/{id}/payments/{uuid}/intent',
			then: 'pending',
			note: 'card leg defaults to the remaining balance 32.95; a card leg can never exceed the balance',
		},
		{ mode: 'device', step: 'collect_and_confirm', side: 'device', then: 'captured' },
	],
	ledger: {
		schema: 1,
		payments: [
			row({
				id: 'd1',
				method: 'pos_gift_card',
				amount: 60,
				status: 'captured',
				capture_mode: 'stored_value',
				recorded_offline: false,
				provider: { name: 'wcpos_gift_cards', refs: { code: 'GC-7F3A', redemption: 'rd_1' } },
			}),
			row({
				id: 'd2',
				method: 'stripe_terminal',
				amount: 32.95,
				status: 'captured',
				capture_mode: 'device',
				recorded_offline: false,
				provider: { name: 'stripe', refs: { payment_intent: 'pi_4', charge: 'ch_4' } },
			}),
		],
	},
	// Woo's payment_method becomes the gift-card gateway: that is what Analytics attributes $92.95 to.
	expect: {
		balance: 0,
		change: 0,
		status: 'completed',
		payment_method: 'pos_gift_card',
		payment_method_title: 'Gift Card + Card',
	},
};

// ---------------------------------------------------------------------------
// 5. Legacy webview gateway — $55.00; the extension owns the flow on the order-pay page and
//    calls $order->payment_complete(); the ledger only learns of it afterwards
// ---------------------------------------------------------------------------
const s5: Scenario = {
	name: '5. legacy webview gateway',
	total: 55,
	events: [
		{
			mode: 'webview',
			step: 'open_order_pay',
			side: 'app',
			then: 'pending',
			note: 'is a pending row minted here (client UUID) — or does no row exist until the gateway pays? Undecided',
		},
		{
			mode: 'webview',
			step: 'gateway_process_payment',
			side: 'extension',
			then: 'pending',
			note: 'order-pay charges $order->get_total(), never a balance → a webview leg cannot be a split leg',
		},
		{
			mode: 'webview',
			step: 'passthrough_writes_row',
			side: 'server',
			then: 'captured',
			note: 'Free hooks payment_complete and writes the row: amount = order total, refs = _transaction_id; UUID server-minted?',
		},
	],
	ledger: {
		schema: 1,
		payments: [
			row({
				id: 'e1-server-minted',
				method: 'eftpos_legacy',
				amount: 55,
				status: 'captured',
				capture_mode: 'webview',
				recorded_offline: false,
				provider: { name: 'eftpos_legacy', refs: { _transaction_id: 'TXN-8812' } },
			}),
		],
	},
	expect: {
		balance: 0,
		change: 0,
		status: 'processing',
		payment_method: 'eftpos_legacy',
		payment_method_title: 'EFTPOS (legacy)',
	},
};

// ---------------------------------------------------------------------------
// 6. Provider refund of one tender of a split — $92.95 = cash $50 + card $42.95, after an
//    earlier card attempt was cancelled mid-way (voided, kept in the ledger, #107.6).
//    Customer returns a $30 item: default allocation fills the most recent capturable leg.
// ---------------------------------------------------------------------------
const s6Ledger: OrderLedger = {
	schema: 1,
	payments: [
		row({
			id: 'f0',
			method: 'stripe_terminal',
			amount: 92.95,
			status: 'voided',
			capture_mode: 'device',
			recorded_offline: false,
			provider: { name: 'stripe', refs: { payment_intent: 'pi_6a' } },
		}),
		row({
			id: 'f1',
			method: 'pos_cash',
			amount: 50,
			tendered: 50,
			status: 'captured',
			capture_mode: 'manual',
			recorded_offline: false,
		}),
		row({
			id: 'f2',
			method: 'stripe_terminal',
			amount: 42.95,
			status: 'captured',
			capture_mode: 'device',
			recorded_offline: false,
			refunded_amount: 30, // rollup written AFTER the allocation below succeeds
			provider: { name: 'stripe', refs: { payment_intent: 'pi_6b', charge: 'ch_6b' } },
		}),
	],
};
const s6Refund: WooRefund = {
	refund_id: 9001,
	amount: 30,
	_wcpos_refund_allocations: [
		{ payment_id: 'f2', amount: 30, via: 'provider', status: 'succeeded', provider_ref: 're_6b' },
		// Nothing in the type stops `{ payment_id: 'f0', amount: 30 }` — f0 is voided.
	],
};
const s6: Scenario = {
	name: '6. provider refund of one tender of a split',
	total: 92.95,
	events: [
		{
			mode: 'device',
			step: 'void',
			side: 'app',
			route: 'POST orders/{id}/payments/{uuid}/void',
			then: 'voided',
			note: 'cancel mid-way: f0 voided through the driver; order back to pos-open',
		},
		{
			mode: 'manual',
			step: 'record',
			side: 'app',
			route: 'POST orders/{id}/payments',
			then: 'captured',
			note: 'cash 50 first',
		},
		{
			mode: 'device',
			step: 'collect_and_confirm',
			side: 'device',
			then: 'captured',
			note: 'card 42.95 = remainder',
		},
		// Refund: Woo creates the shop_order_refund child; wc_refund_payment() is short-circuited (split);
		// the provider refund is server-side (POST /v1/refunds) — but there is NO refund route in the family.
	],
	ledger: s6Ledger,
	refund: {
		woo: s6Refund,
		default_allocation_matches:
			JSON.stringify(
				defaultAllocation(
					30,
					{ ...s6Ledger, payments: s6Ledger.payments.map((p) => ({ ...p, refunded_amount: 0 })) },
					descriptors
				).map((a) => [a.payment_id, a.amount, a.via])
			) === JSON.stringify([['f2', 30, 'provider']]),
	},
	// Woo's scalar still names the largest tender — cash — while the money went back to the card.
	expect: {
		balance: 0,
		change: 0,
		status: 'completed',
		payment_method: 'pos_cash',
		payment_method_title: 'Cash + Card',
	},
};

// ---------------------------------------------------------------------------
// Check derived values against expectations (run with tsx; type-check with tsc)
// ---------------------------------------------------------------------------
export const scenarios: Scenario[] = [s1, s2, s3, s4, s5, s6];

for (const s of scenarios) {
	const got = derive(s.total, s.ledger, descriptors);
	const keys = Object.keys(s.expect) as (keyof Scenario['expect'])[];
	const diffs = keys
		.filter((k) => got[k] !== s.expect[k])
		.map((k) => `${k}: got ${got[k]}, expected ${s.expect[k]}`);
	const alloc = s.refund
		? ` allocation-default=${s.refund.default_allocation_matches ? 'ok' : 'MISMATCH'}`
		: '';
	console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${s.name}${alloc}`, diffs.length ? diffs : got);
}
