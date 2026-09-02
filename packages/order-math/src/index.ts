// ===== @wcpos/order-math public surface =====
// The settle surface is per SPEC §3; the payments section is Payments Contract v1.

export { createCartConfig } from './config';
export type { CartConfig, CartConfigInput } from './config';

export {
	snapshotFromOrderJSON,
	isActiveLineItem,
	isActiveFeeLine,
	isActiveShippingLine,
	isActiveCouponLine,
} from './snapshot';
export type { CartSnapshot } from './snapshot';

export { settleCart, settleAggregate } from './settle';
export type {
	SettleOptions,
	SettlePatch,
	SettleError,
	SettleResult,
	SettleAggregatePatch,
	SettleAggregateResult,
	TaxLineOutput,
} from './settle';

export { calculateCartLine } from './cart-line';
export type {
	CartLineInput,
	LineItemChanges,
	FeeLineChanges,
	ShippingLineChanges,
	CalcLineResult,
} from './cart-line';

export type { OrderTotals } from './internal/order-totals';

export { getNetPaymentTotal, refundValue } from './net-payment';

export type {
	MoneyString,
	MetaDataInput,
	TaxEntryInput,
	LineItemInput,
	FeeLineInput,
	ShippingLineInput,
	CouponLineInput,
	TaxRateInput,
	CouponInput,
	CouponContext,
	WarningSite,
	EngineWarning,
	CouponRejection,
	CouponRejectionCode,
	RefundLike,
} from './types';

// ===== Payments contract v1 (wcpos/roadmap#97) =====
export {
	derive,
	readLedger,
	withLedger,
	upsertPaymentRow,
	mintManualPayment,
	toMinor,
	fromMinor,
	LEDGER_META_KEY,
	LEDGER_SCHEMA,
	KNOWN_CAPTURE_MODES,
	KNOWN_KINDS,
} from './payments';
export type {
	PaymentKind,
	CaptureMode,
	OpenEnum,
	PaymentTransport,
	PaymentMethodDescriptor,
	PaymentMethodsEnvelope,
	PaymentStatus,
	PaymentSource,
	PaymentRefundEntry,
	PaymentRow,
	OrderLedger,
	OrderPaymentSummary,
	PaymentRouteResponse,
	PaymentErrorCode,
	PaymentRefusalBody,
	PosOrderStatus,
	DerivedOrderView,
} from './payments';
