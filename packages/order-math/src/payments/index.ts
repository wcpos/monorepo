/**
 * One payments entry point keeps the contract consumable without exposing implementation paths.
 */

export {
	saleProvenanceMeta,
	SPLIT_META_KEY,
	splitPlanMeta,
	hasSaleProvenance,
	hasSaleTime,
	withSaleProvenance,
	withMetaReplaced,
	COMPLETIONS_META_KEY,
	readCompletions,
	type SaleCompletion,
} from './provenance';
export { derive, isCompletingStatus } from './derive';
export {
	readLedger,
	withLedger,
	upsertPaymentRow,
	mintManualPayment,
	mintServerPayment,
	mintDevicePayment,
	LEDGER_META_KEY,
	LEDGER_SCHEMA,
	PAYMENT_METHOD_INDEX_META_KEY,
	LIVE_PAYMENT_STATUSES,
	isLivePaymentStatus,
	isSettledPaymentRow,
	isFinalPaymentStatus,
	isFailedPaymentStatus,
	hasLiveSettlementLeg,
} from './ledger';
export type {
	MetaDataEntry,
	MintManualPaymentInput,
	MintManualPaymentResult,
	MintServerPaymentInput,
	MintDevicePaymentInput,
	MintServerPaymentResult,
} from './ledger';
export { toMinor, fromMinor } from './money';
export { roundToIncrement, roundedDue, settlesAtRoundedDue } from './rounding';
export type { PaymentRounding } from './rounding';
export type { PaymentMoney } from './money';
export { FIELDS_SCHEMA, KNOWN_CAPTURE_MODES, KNOWN_KINDS, KNOWN_PREFILLS } from './types';
export {
	AWAITING_CUSTOMER_META_KEY,
	activeAwaitingCustomer,
	readAwaitingCustomer,
	withAwaitingCustomer,
} from './awaiting-customer';
export type { AwaitingCustomerStamp } from './awaiting-customer';
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
	PaymentHardware,
	PaymentEvent,
	OrderLedger,
	OrderPaymentSummary,
	PaymentRouteResponse,
	PaymentErrorCode,
	PaymentRefusalBody,
	DeclaredComponent,
	DeclaredFields,
	DeclaredValues,
	FieldInput,
	FieldPrefill,
	FieldsVerbKind,
	GatewaySubmitResponse,
	PosOrderStatus,
	DerivedOrderView,
} from './types';
