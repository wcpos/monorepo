import address, { addressSchema } from './address';
import attribute, { attributeSchema } from './attribute';
import category, { categorySchema } from './category';
import couponLine, { couponLineSchema } from './coupon-line';
import customer, { customerSchema } from './customer';
import feeLine, { feeLineSchema } from './fee-line';
import image, { imageSchema } from './image';
import lineItem, { lineItemSchema } from './line-item';
import meta, { metaSchema } from './meta';
import order, { orderSchema } from './order';
import orderNote, { orderNoteSchema } from './order-note';
import product, { productSchema } from './product';
import productAttribute, { productAttributeSchema } from './product-attribute';
import productCategory, { productCategorySchema } from './product-category';
import productTag, { productTagSchema } from './product-tag';
import productVariation, { productVariationSchema } from './product-variation';
import refund, { refundSchema } from './refund';
import shippingLine, { shippingLineSchema } from './shipping-line';
import tag, { tagSchema } from './tag';
import tax, { taxSchema } from './tax';

export const schemas = [
	addressSchema,
	attributeSchema,
	categorySchema,
	couponLineSchema,
	customerSchema,
	feeLineSchema,
	imageSchema,
	lineItemSchema,
	metaSchema,
	orderSchema,
	orderNoteSchema,
	productSchema,
	productAttributeSchema,
	productCategorySchema,
	productTagSchema,
	productVariationSchema,
	refundSchema,
	shippingLineSchema,
	tagSchema,
	taxSchema,
];

export const modelClasses = [
	address,
	attribute,
	category,
	couponLine,
	customer,
	feeLine,
	image,
	lineItem,
	meta,
	order,
	orderNote,
	product,
	productAttribute,
	productCategory,
	productTag,
	productVariation,
	refund,
	shippingLine,
	tag,
	tax,
];
