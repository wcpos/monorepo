// ===== @wcpos/order-math public surface (SPEC §3) =====
// Exactly these exports; nothing more. See docs/superpowers/specs/2026-06-10-order-math-spec.md

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

export { settleCart } from './settle';
export type {
	SettleOptions,
	SettlePatch,
	SettleError,
	SettleResult,
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

export { getOrderTotals } from './order-totals';
export type { OrderTotals } from './order-totals';

export { getNetPaymentTotal } from './net-payment';

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
