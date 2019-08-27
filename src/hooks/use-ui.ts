import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const initialUI = {
	pos_products: {
		sortBy: 'name',
		sortDirection: 'asc',
		columns: [
			{ key: 'image', disableSort: true },
			{ key: 'name' },
			{ key: 'sku', hide: true },
			{ key: 'price' },
			{ key: 'actions', disableSort: true },
		],
		display: [
			{ key: 'sku', hide: true, label: 'SKU' },
			{ key: 'categories', label: 'Categories' },
			{ key: 'tags', hide: true, label: 'Tags' },
		],
	},
	products: {
		sortBy: 'name',
		sortDirection: 'asc',
		columns: [
			{ key: 'image', disableSort: true },
			{ key: 'id' },
			{ key: 'name' },
			{ key: 'sku' },
			{ key: 'regular_price' },
			{ key: 'sale_price' },
			{ key: 'actions', disableSort: true },
			{ key: 'categories', hide: true },
			{ key: 'tags', hide: true },
		],
	},
	orders: {
		sortBy: 'number',
		sortDirection: 'desc',
		columns: [
			{ key: 'status', width: '10%' },
			{ key: 'number', width: '10%' },
			{ key: 'customer', flexGrow: 1 },
			{ key: 'note', width: '10%' },
			{ key: 'date_created', flexGrow: 1 },
			{ key: 'date_modified', hide: true, width: '10%' },
			{ key: 'date_completed', hide: true, width: '10%' },
			{ key: 'total', width: '10%' },
			{ key: 'actions', disableSort: true, width: '10%' },
		],
	},
	customers: {
		sortBy: 'last_name',
		sortDirection: 'asc',
		columns: [
			{ key: 'avatar_url', disableSort: true },
			{ key: 'first_name' },
			{ key: 'last_name' },
			{ key: 'email' },
			{ key: 'role', hide: true },
			{ key: 'username', hide: true },
			{ key: 'billing' },
			{ key: 'shipping' },
			{ key: 'actions', disableSort: true },
		],
	},
};

export default function useUI(section: 'pos_products' | 'customers' | 'products') {
	const { t } = useTranslation();
	const ui = initialUI[section];

	// add labels and order
	ui.columns.map((column, index) => {
		column.label = t(section + '.column.label.' + column.key);
		column.order = index;
	});

	if (ui.display) {
		ui.display.map((display, index) => {
			display.label = t(section + '.display.label.' + display.key);
		});
	}

	return ui;
}
