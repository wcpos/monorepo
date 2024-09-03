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
					showOutOfStock: t('Show out-of-stock products', { _tags: 'core' }),
					image: t('Image', { _tags: 'core' }),
					name: t('Product', { _tags: 'core' }),
					stock_quantity: t('Stock', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					barcode: t('Barcode', { _tags: 'core' }),
					categories: t('Categories', { _tags: 'core' }),
					tags: t('Tags', { _tags: 'core' }),
					type: t('Type', { _tags: 'core' }),
					regular_price: t('Regular price', { _tags: 'core' }),
					on_sale: t('On Sale', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
					attributes: t('Attributes', { _tags: 'core' }),
					meta_data: t('Meta Data', { _tags: 'core' }),
					metaDataKeys: t('Meta Data Keys', { _tags: 'core' }),
				},
				'pos-cart': {
					autoShowReceipt: t('Automatically show receipt after checkout', { _tags: 'core' }),
					autoPrintReceipt: t('Automatically print receipt after checkout', { _tags: 'core' }),
					quickDiscounts: t('Quick Discounts', { _tags: 'core' }),
					quantity: t('Qty', { _tags: 'core', _context: 'Short for quantity' }),
					split: t('Split', { _tags: 'core', _context: 'Split quantity' }),
					name: t('Name', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					regular_price: t('Regular Price', { _tags: 'core' }),
					on_sale: t('On Sale', { _tags: 'core' }),
					total: t('Total', { _tags: 'core' }),
					subtotal: t('Subtotal', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
				products: {
					image: t('Image', { _tags: 'core' }),
					id: t('ID', { _tags: 'core' }),
					name: t('Product', { _tags: 'core' }),
					stock_quantity: t('Stock', { _tags: 'core' }),
					stock_status: t('Stock Status', { _tags: 'core' }),
					sku: t('SKU', { _tags: 'core' }),
					barcode: t('Barcode', { _tags: 'core' }),
					categories: t('Categories', { _tags: 'core' }),
					tags: t('Tags', { _tags: 'core' }),
					type: t('Type', { _tags: 'core' }),
					price: t('Price', { _tags: 'core' }),
					regular_price: t('Regular Price', { _tags: 'core' }),
					sale_price: t('Sale Price', { _tags: 'core' }),
					tax: t('Tax', { _tags: 'core' }),
					date_created_gmt: t('Date Created', { _tags: 'core' }),
					date_modified_gmt: t('Date Modified', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
					attributes: t('Attributes', { _tags: 'core' }),
				},
				orders: {
					status: t('Status', { _tags: 'core' }),
					number: t('Order Number', { _tags: 'core' }),
					created_via: t('Created Via', { _tags: 'core' }),
					customer_id: t('Customer', { _tags: 'core' }),
					billing: t('Billing Address', { _tags: 'core' }),
					shipping: t('Shipping Address', { _tags: 'core' }),
					products: t('Products', { _tags: 'core' }),
					customer_note: t('Customer Note', { _tags: 'core' }),
					date_created_gmt: t('Date Created', { _tags: 'core' }),
					date_modified_gmt: t('Date Modified', { _tags: 'core' }),
					date_completed_gmt: t('Date Completed', { _tags: 'core' }),
					date_paid_gmt: t('Date paid', { _tags: 'core' }),
					cashier: t('Cashier', { _tags: 'core' }),
					payment_method: t('Payment Method', { _tags: 'core' }),
					total: t('Total', { _tags: 'core' }),
					receipt: t('Receipt', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
				customers: {
					avatar_url: t('Image', { _tags: 'core' }),
					id: t('ID', { _tags: 'core' }),
					first_name: t('First Name', { _tags: 'core' }),
					last_name: t('Last Name', { _tags: 'core' }),
					email: t('Email', { _tags: 'core' }),
					billing: t('Billing Address', { _tags: 'core' }),
					shipping: t('Shipping Address', { _tags: 'core' }),
					role: t('Role', { _tags: 'core' }),
					username: t('Username', { _tags: 'core' }),
					date_created_gmt: t('Date Created', { _tags: 'core' }),
					date_modified_gmt: t('Date Modified', { _tags: 'core' }),
					actions: t('Actions', { _tags: 'core' }),
				},
				'reports-orders': {
					select: t('Select', { _tags: 'core' }),
					status: t('Status', { _tags: 'core' }),
					number: t('Order Number', { _tags: 'core' }),
					created_via: t('Created Via', { _tags: 'core' }),
					customer_id: t('Customer', { _tags: 'core' }),
					billing: t('Billing Address', { _tags: 'core' }),
					shipping: t('Shipping Address', { _tags: 'core' }),
					products: t('Products', { _tags: 'core' }),
					date_created_gmt: t('Date Created', { _tags: 'core' }),
					date_modified_gmt: t('Date Modified', { _tags: 'core' }),
					date_completed_gmt: t('Date Completed', { _tags: 'core' }),
					date_paid_gmt: t('Date Paid', { _tags: 'core' }),
					cashier: t('Cashier', { _tags: 'core' }),
					payment_method: t('Payment Method', { _tags: 'core' }),
					total: t('Total', { _tags: 'core' }),
				},
				logs: {
					timestamp: t('Time', { _tags: 'core' }),
					level: t('Level', { _tags: 'core' }),
					message: t('Message', { _tags: 'core' }),
					context: t('Context', { _tags: 'core' }),
					code: t('Code', { _tags: 'core' }),
				},
			};

			return get(labels, [id, key], t('{item} label not found', { _tags: 'core', item: key }));
		},
		[t]
	);

	return {
		getLabel,
	};
};
