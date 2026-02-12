import * as React from 'react';

import get from 'lodash/get';

import { useT } from '../../../../contexts/translations';

export const useUILabel = () => {
	const t = useT();

	/**
	 *
	 */
	const getLabel = React.useCallback(
		(id: string, key: string) => {
			const labels = {
				'pos-products': {
					showOutOfStock: t('common.show_out-of-stock_products'),
					image: t('common.image'),
					name: t('common.product_name'),
					stock_quantity: t('common.stock'),
					sku: t('common.sku'),
					barcode: t('common.barcode'),
					categories: t('common.categories'),
					tags: t('common.tags'),
					brands: t('common.brands'),
					type: t('common.type'),
					cost_of_goods_sold: t('common.cost_of_goods_sold'),
					regular_price: t('common.regular_price_2'),
					on_sale: t('common.on_sale'),
					price: t('common.price'),
					tax: t('common.tax'),
					actions: t('common.actions'),
					attributes: t('common.attributes'),
					meta_data: t('common.meta_data'),
					metaDataKeys: t('common.meta_data_keys'),
					viewMode: t('common.view_mode'),
					gridColumns: t('common.tile_size'),
					category: t('common.categories'),
				},
				'pos-cart': {
					autoShowReceipt: t('common.automatically_show_receipt_after_checkout'),
					autoPrintReceipt: t('common.automatically_print_receipt_after_checkout'),
					quickDiscounts: t('common.quick_discounts'),
					quantity: t('pos_cart.qty_abbrev'),
					split: t('pos_cart.split_qty'),
					name: t('common.name'),
					sku: t('common.sku'),
					price: t('common.price'),
					regular_price: t('common.regular_price'),
					on_sale: t('common.on_sale'),
					total: t('common.total'),
					subtotal: t('common.subtotal'),
					tax: t('common.tax'),
					actions: t('common.actions'),
				},
				products: {
					image: t('common.image'),
					id: t('common.id'),
					name: t('common.product'),
					stock_quantity: t('common.stock'),
					stock_status: t('common.stock_status'),
					sku: t('common.sku'),
					barcode: t('common.barcode'),
					categories: t('common.categories'),
					tags: t('common.tags'),
					brands: t('common.brands'),
					type: t('common.type'),
					cost_of_goods_sold: t('common.cost_of_goods_sold'),
					price: t('common.price'),
					regular_price: t('common.regular_price'),
					sale_price: t('common.sale_price'),
					tax: t('common.tax'),
					date_created_gmt: t('common.date_created'),
					date_modified_gmt: t('common.date_modified'),
					actions: t('common.actions'),
					attributes: t('common.attributes'),
				},
				orders: {
					status: t('common.status'),
					number: t('common.order_number'),
					created_via: t('common.created_via'),
					customer_id: t('common.customer'),
					billing: t('common.billing_address'),
					shipping: t('common.shipping_address'),
					products: t('common.products'),
					customer_note: t('common.customer_note'),
					date_created_gmt: t('common.date_created'),
					date_modified_gmt: t('common.date_modified'),
					date_completed_gmt: t('common.date_completed'),
					date_paid_gmt: t('common.date_paid_2'),
					cashier: t('common.cashier'),
					payment_method: t('common.payment_method'),
					total: t('common.total'),
					receipt: t('common.receipt'),
					actions: t('common.actions'),
				},
				customers: {
					avatar_url: t('common.image'),
					id: t('common.id'),
					first_name: t('common.first_name'),
					last_name: t('common.last_name'),
					email: t('common.email'),
					billing: t('common.billing_address'),
					shipping: t('common.shipping_address'),
					role: t('common.role'),
					username: t('common.username'),
					date_created_gmt: t('common.date_created'),
					date_modified_gmt: t('common.date_modified'),
					actions: t('common.actions'),
				},
				'reports-orders': {
					select: t('common.select'),
					status: t('common.status'),
					number: t('common.order_number'),
					created_via: t('common.created_via'),
					customer_id: t('common.customer'),
					billing: t('common.billing_address'),
					shipping: t('common.shipping_address'),
					products: t('common.products'),
					date_created_gmt: t('common.date_created'),
					date_modified_gmt: t('common.date_modified'),
					date_completed_gmt: t('common.date_completed'),
					date_paid_gmt: t('common.date_paid'),
					cashier: t('common.cashier'),
					payment_method: t('common.payment_method'),
					total: t('common.total'),
				},
				logs: {
					timestamp: t('common.time'),
					level: t('common.level'),
					message: t('common.message'),
					context: t('common.context'),
					code: t('common.code'),
				},
			};

			return get(labels, [id, key], t('common.label_not_found', { item: key }));
		},
		[t]
	);

	return {
		getLabel,
	};
};
