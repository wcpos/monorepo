// ===== @wcpos/order-math public surface =====
// The settle surface is per SPEC §3; the payments section is Payments Contract v1.

export { serverOwnsMoney } from './payments/money-owner';

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

export { settleCart, settleAggregate, settlementPatch } from './settle';
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
export { retaxLine } from './retax-line';
export type { RetaxLineInput } from './retax-line';
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
	countsTowardPaid,
	derive,
	isCompletingStatus,
	hasSaleProvenance,
	hasSaleTime,
	readCompletions,
	saleProvenanceMeta,
	SPLIT_META_KEY,
	splitPlanMeta,
	withSaleProvenance,
	withMetaReplaced,
	readLedger,
	withLedger,
	upsertPaymentRow,
	samePaymentId,
	mintManualPayment,
	mintServerPayment,
	mintDevicePayment,
	toMinor,
	fromMinor,
	roundToIncrement,
	roundedDue,
	settlesAtRoundedDue,
	LEDGER_META_KEY,
	LEDGER_SCHEMA,
	PAYMENT_METHOD_INDEX_META_KEY,
	isLivePaymentStatus,
	isSettledPaymentRow,
	isFinalPaymentStatus,
	isFailedPaymentStatus,
	isInMotionPaymentStatus,
	isOfflineDeviceAuthorization,
	OFFLINE_DEVICE_AUTHORIZATION,
	hasLiveSettlementLeg,
	partitionVoidableRows,
	KNOWN_CAPTURE_MODES,
	KNOWN_KINDS,
	KNOWN_PREFILLS,
	FIELDS_SCHEMA,
	activeAwaitingCustomer,
	readAwaitingCustomer,
	withAwaitingCustomer,
	readGatewayAttempts,
	withGatewayAttempt,
	withAttemptAnswer,
} from './payments';
export type {
	MetaDataEntry,
	MintManualPaymentInput,
	MintServerPaymentInput,
	MintDevicePaymentInput,
	MintServerPaymentResult,
	MintManualPaymentResult,
	PaymentMoney,
	PaymentRounding,
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
	PaymentHardware,
	PaymentEvent,
	OrderLedger,
	OrderPaymentSummary,
	PaymentRouteResponse,
	PaymentErrorCode,
	PaymentRefusalBody,
	PosOrderStatus,
	DerivedOrderView,
	AwaitingCustomerStamp,
	GatewayAttempt,
	DeclaredComponent,
	DeclaredFields,
	DeclaredValues,
	FieldInput,
	FieldPrefill,
	FieldsVerbKind,
	GatewaySubmitResponse,
} from './payments';

export { APP_PAYMENTS_CONTRACT, parsePaymentsContract } from './payments/contract';
