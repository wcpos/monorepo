/**
 * Wire types stay explicit because field names and nullability are part of Payments Contract v1.
 */

export type PaymentKind = 'cash' | 'card' | 'stored_value' | 'bank_transfer' | 'other';
export const KNOWN_KINDS: readonly PaymentKind[] = [
	'cash',
	'card',
	'stored_value',
	'bank_transfer',
	'other',
];

export type CaptureMode = 'manual' | 'webview' | 'server' | 'device' | 'stored_value';
export const KNOWN_CAPTURE_MODES: readonly CaptureMode[] = [
	'manual',
	'webview',
	'server',
	'device',
	'stored_value',
];

/** Open vocabularies survive parsing so unknown methods can be shown disabled-with-reason. */
export type OpenEnum<Known extends string> = Known | (string & {});
export type PaymentTransport = 'bluetooth' | 'usb' | 'network' | 'tap_to_pay';

export interface PaymentMethodDescriptor {
	schema: 1;
	id: string;
	title: string;
	kind: OpenEnum<PaymentKind>;
	pos_enabled: boolean;
	order: number;
	capture: {
		mode: OpenEnum<CaptureMode>;
		provider: string | null;
		hardware: {
			transports: {
				transport: OpenEnum<PaymentTransport>;
				offline: OpenEnum<'record' | 'queue' | 'none'>;
				tips: OpenEnum<'none' | 'on_reader' | 'at_till'>;
			}[];
			discovery: OpenEnum<'sdk' | 'manual'>;
		} | null;
		webview_available: boolean;
	};
	capabilities: {
		amount: { partial: boolean; min?: string; max?: string };
		change: boolean;
		refunds: { via: OpenEnum<'provider' | 'manual' | 'device' | 'none'>; partial: boolean };
		tips: OpenEnum<'none' | 'on_reader' | 'at_till'>;
		offline: OpenEnum<'record' | 'queue' | 'none'>;
		void: boolean;
	};
	defaults: {
		order_status: string;
		rounding: { increment: string; mode: 'nearest' | 'up' | 'down' } | null;
		open_drawer: boolean;
	};
	provider_data: Record<string, unknown>;
}

export interface PaymentMethodsEnvelope {
	schema: 1;
	contract: string;
	methods: PaymentMethodDescriptor[];
	deprecated?: string[];
}

export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'voided';
export type PaymentSource = 'app' | 'webview';
export interface PaymentRefundEntry {
	id: number;
	amount: string;
	status: 'pending' | 'succeeded' | 'failed';
	provider_ref: string | null;
}

export interface PaymentRow {
	id: string;
	source: PaymentSource;
	order_id: number;
	method_id: string;
	provider: string | null;
	kind: OpenEnum<PaymentKind>;
	capture_mode: OpenEnum<CaptureMode>;
	transport: string | null;
	recorded_offline: boolean;
	amount: string;
	currency: string;
	tendered: string | null;
	change: string | null;
	tip: string | null;
	status: PaymentStatus;
	failure_reason: string | null;
	refunded_amount: string;
	refunds: PaymentRefundEntry[];
	provider_refs: Record<string, string | null>;
	receipt: Record<string, string>;
	cashier_id: number;
	store_id: number | null;
	created_at_gmt: string;
	captured_at_gmt: string | null;
	updated_at_gmt: string;
	[extra: string]: unknown;
}

export interface OrderLedger {
	schema: 1;
	payments: PaymentRow[];
}

/** Server derivation returned by payment routes; clients do not recompute after writes. */
export interface OrderPaymentSummary {
	status: string;
	total: string;
	paid: string;
	balance: string;
	payment_method: string;
	payment_method_title: string;
}
export interface PaymentRouteResponse {
	payment: PaymentRow;
	order: OrderPaymentSummary;
}

export type PaymentErrorCode =
	| 'wcpos_payment_method_not_found'
	| 'wcpos_payment_method_disabled'
	| 'wcpos_capture_mode_unsupported'
	| 'wcpos_payment_not_found'
	| 'wcpos_payment_conflict'
	| 'wcpos_invalid_transition'
	| 'wcpos_amount_exceeds_balance'
	| 'wcpos_order_already_paid'
	| 'wcpos_refund_not_allocatable'
	| 'wcpos_provider_error';

/** A refused row is stored server-side as failed and may be returned with the WP_Error body. */
export interface PaymentRefusalBody {
	code: OpenEnum<PaymentErrorCode>;
	message: string;
	data: {
		status: number;
		payment?: PaymentRow;
		order?: OrderPaymentSummary;
		detail?: unknown;
	};
}

export type PosOrderStatus = 'pos-open' | 'pos-partial' | 'pending' | (string & {});
export interface DerivedOrderView {
	paid: string;
	balance: string;
	overpaid: string;
	change: string;
	status: PosOrderStatus;
	payment_method: string | null;
	payment_method_title: string;
	transaction_id: string;
	method_ids: string[];
}
