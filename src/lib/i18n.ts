import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
	lng: 'en',
	fallbackLng: 'en',
	debug: true,

	// have a common namespace used around the full app
	ns: ['common'],
	defaultNS: 'common',

	interpolation: {
		escapeValue: false, // not needed for react as it escapes by default
	},

	// bootstrap
	resources: {
		en: {
			common: {
				button: {
					sync: 'Sync',
					show: 'Show',
					delete: 'Delete',
				},
				customers: {
					column: {
						label: {
							actions: 'Actions',
							avatar_url: 'Image',
							billing: 'Billing Address',
							email: 'Email',
							first_name: 'First Name',
							last_name: 'Last Name',
							role: 'Role',
							shipping: 'Shipping Address',
							username: 'Username',
						},
					},
				},
				orders: {
					column: {
						label: {
							actions: 'Actions',
							customer: 'Customer',
							billing: 'Billing',
							shipping: 'Shipping',
							date_completed: 'Date Completed',
							date_created: 'Date Created',
							date_modified: 'Date Modified',
							note: 'Note',
							number: 'Order Number',
							status: 'Status',
							total: 'Total',
						},
					},
				},
				pos_products: {
					column: {
						label: {
							actions: 'Actions',
							id: 'ID',
							image: 'Image',
							name: 'Product',
							price: 'Price',
							regular_price: 'Regular Price',
							sale_price: 'Sale Price',
							sku: 'SKU',
							stock: 'Stock',
						},
					},
					display: {
						label: {
							sku: 'SKU',
							categories: 'Categories',
							tags: 'Tags',
						},
					},
				},
				products: {
					button: {
						sync: 'Sync Products',
					},
					column: {
						label: {
							actions: 'Actions',
							customer: 'Customer',
							date_created: 'Created',
							id: 'ID',
							image: 'Image',
							name: 'Product',
							price: 'Price',
							qty: 'Qty',
							regular_price: 'Regular Price',
							sale_price: 'Sale Price',
							sku: 'SKU',
							status: 'Status',
							stock: 'Stock',
							total: 'Total',
							categories: 'Category',
							tags: 'Tags',
						},
					},
					search: {
						placeholder: 'Search Products',
						empty: 'Product not found',
					},
					select: {
						placeholder: 'Select...',
						empty: 'Not Found',
						loading: 'Loading',
					},
					showing: 'Showing {{showing}} of {{total}}',
					in_stock: '{{quantity}} in stock',
				},
			},
		},
	},
});

export default i18n;
