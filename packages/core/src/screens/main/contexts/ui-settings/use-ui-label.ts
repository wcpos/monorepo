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
					showOutOfStock: t('Show out-of-stock products'),
					image: t('Image'),
					name: t('Product'),
					stock_quantity: t('Stock'),
					sku: t('SKU'),
					barcode: t('Barcode'),
					categories: t('Categories'),
					tags: t('Tags'),
					brands: t('Brands'),
					type: t('Type'),
					cost_of_goods_sold: t('Cost of Goods Sold'),
					regular_price: t('Regular price'),
					on_sale: t('On Sale'),
					price: t('Price'),
					tax: t('Tax'),
					actions: t('Actions'),
					attributes: t('Attributes'),
					meta_data: t('Meta Data'),
					metaDataKeys: t('Meta Data Keys'),
				},
				'pos-cart': {
					autoShowReceipt: t('Automatically show receipt after checkout'),
					autoPrintReceipt: t('Automatically print receipt after checkout'),
					quickDiscounts: t('Quick Discounts'),
					quantity: t('Qty', { _context: 'Short for quantity' }),
					split: t('Split', { _context: 'Split quantity' }),
					name: t('Name'),
					sku: t('SKU'),
					price: t('Price'),
					regular_price: t('Regular Price'),
					on_sale: t('On Sale'),
					total: t('Total'),
					subtotal: t('Subtotal'),
					tax: t('Tax'),
					actions: t('Actions'),
				},
				products: {
					image: t('Image'),
					id: t('ID'),
					name: t('Product'),
					stock_quantity: t('Stock'),
					stock_status: t('Stock Status'),
					sku: t('SKU'),
					barcode: t('Barcode'),
					categories: t('Categories'),
					tags: t('Tags'),
					brands: t('Brands'),
					type: t('Type'),
					cost_of_goods_sold: t('Cost of Goods Sold'),
					price: t('Price'),
					regular_price: t('Regular Price'),
					sale_price: t('Sale Price'),
					tax: t('Tax'),
					date_created_gmt: t('Date Created'),
					date_modified_gmt: t('Date Modified'),
					actions: t('Actions'),
					attributes: t('Attributes'),
				},
				orders: {
					status: t('Status'),
					number: t('Order Number'),
					created_via: t('Created Via'),
					customer_id: t('Customer'),
					billing: t('Billing Address'),
					shipping: t('Shipping Address'),
					products: t('Products'),
					customer_note: t('Customer Note'),
					date_created_gmt: t('Date Created'),
					date_modified_gmt: t('Date Modified'),
					date_completed_gmt: t('Date Completed'),
					date_paid_gmt: t('Date paid'),
					cashier: t('Cashier'),
					payment_method: t('Payment Method'),
					total: t('Total'),
					receipt: t('Receipt'),
					actions: t('Actions'),
				},
				customers: {
					avatar_url: t('Image'),
					id: t('ID'),
					first_name: t('First Name'),
					last_name: t('Last Name'),
					email: t('Email'),
					billing: t('Billing Address'),
					shipping: t('Shipping Address'),
					role: t('Role'),
					username: t('Username'),
					date_created_gmt: t('Date Created'),
					date_modified_gmt: t('Date Modified'),
					actions: t('Actions'),
				},
				'reports-orders': {
					select: t('Select'),
					status: t('Status'),
					number: t('Order Number'),
					created_via: t('Created Via'),
					customer_id: t('Customer'),
					billing: t('Billing Address'),
					shipping: t('Shipping Address'),
					products: t('Products'),
					date_created_gmt: t('Date Created'),
					date_modified_gmt: t('Date Modified'),
					date_completed_gmt: t('Date Completed'),
					date_paid_gmt: t('Date Paid'),
					cashier: t('Cashier'),
					payment_method: t('Payment Method'),
					total: t('Total'),
				},
				logs: {
					timestamp: t('Time'),
					level: t('Level'),
					message: t('Message'),
					context: t('Context'),
					code: t('Code'),
				},
			};

			return get(labels, [id, key], t('{item} label not found', { item: key }));
		},
		[t]
	);

	return {
		getLabel,
	};
};
