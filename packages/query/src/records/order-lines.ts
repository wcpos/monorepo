import type { EngineRecord } from './engine-record';

export type OrderPayload = EngineRecord<'orders'>['payload'];
export type OrderLineItem = NonNullable<OrderPayload['line_items']>[number];
export type OrderFeeLine = NonNullable<OrderPayload['fee_lines']>[number];
export type OrderShippingLine = NonNullable<OrderPayload['shipping_lines']>[number];
export type OrderCouponLine = NonNullable<OrderPayload['coupon_lines']>[number];
export type OrderTaxLines = OrderPayload['tax_lines'];
export type OrderMetaData = NonNullable<OrderPayload['meta_data']>;
export type CustomerPayload = EngineRecord<'customers'>['payload'];
export type CouponPayload = EngineRecord<'coupons'>['payload'];
export type ProductPayload = EngineRecord<'products'>['payload'];
export type VariationPayload = EngineRecord<'variations'>['payload'];
