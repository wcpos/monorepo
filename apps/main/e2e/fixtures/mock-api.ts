import type { Page, Route } from '@playwright/test';

/**
 * Mock WooCommerce API responses for e2e testing
 *
 * These fixtures allow tests to run without a real WooCommerce store
 * by intercepting API requests and returning mock data.
 */

export const mockStore = {
	name: 'Test Store',
	description: 'A test WooCommerce store',
	url: 'https://test-store.example.com',
	home: 'https://test-store.example.com',
	wc_version: '9.0.0',
	gmt_offset: 0,
	timezone_string: 'UTC',
	currency: 'USD',
	currency_format: '$%s',
	currency_position: 'left',
	price_format: '$%s',
	thousand_separator: ',',
	decimal_separator: '.',
	weight_unit: 'kg',
	dimension_unit: 'cm',
	tax_included: false,
	prices_include_tax: false,
};

export const mockProducts = [
	{
		id: 1,
		name: 'Test Product 1',
		slug: 'test-product-1',
		permalink: 'https://test-store.example.com/product/test-product-1',
		type: 'simple',
		status: 'publish',
		price: '19.99',
		regular_price: '19.99',
		sale_price: '',
		stock_status: 'instock',
		stock_quantity: 100,
		manage_stock: true,
		categories: [{ id: 1, name: 'Uncategorized', slug: 'uncategorized' }],
		images: [],
	},
	{
		id: 2,
		name: 'Test Product 2',
		slug: 'test-product-2',
		permalink: 'https://test-store.example.com/product/test-product-2',
		type: 'simple',
		status: 'publish',
		price: '29.99',
		regular_price: '29.99',
		sale_price: '',
		stock_status: 'instock',
		stock_quantity: 50,
		manage_stock: true,
		categories: [{ id: 1, name: 'Uncategorized', slug: 'uncategorized' }],
		images: [],
	},
];

export const mockCustomers = [
	{
		id: 1,
		email: 'test@example.com',
		first_name: 'Test',
		last_name: 'Customer',
		username: 'testcustomer',
		role: 'customer',
		billing: {
			first_name: 'Test',
			last_name: 'Customer',
			company: '',
			address_1: '123 Test St',
			address_2: '',
			city: 'Test City',
			state: 'CA',
			postcode: '12345',
			country: 'US',
			email: 'test@example.com',
			phone: '555-1234',
		},
		shipping: {
			first_name: 'Test',
			last_name: 'Customer',
			company: '',
			address_1: '123 Test St',
			address_2: '',
			city: 'Test City',
			state: 'CA',
			postcode: '12345',
			country: 'US',
		},
	},
];

export const mockOrders = [
	{
		id: 1,
		status: 'processing',
		currency: 'USD',
		total: '49.98',
		total_tax: '0.00',
		customer_id: 1,
		billing: mockCustomers[0].billing,
		shipping: mockCustomers[0].shipping,
		line_items: [
			{
				id: 1,
				name: 'Test Product 1',
				product_id: 1,
				quantity: 2,
				price: '19.99',
				total: '39.98',
			},
		],
	},
];

export const mockTaxRates = [
	{
		id: 1,
		country: 'US',
		state: 'CA',
		postcode: '',
		city: '',
		rate: '7.25',
		name: 'CA Tax',
		priority: 1,
		compound: false,
		shipping: true,
		order: 0,
		class: 'standard',
	},
];

/**
 * Setup API mocking for a page
 */
export async function setupApiMocks(page: Page) {
	// Mock WooCommerce REST API endpoints
	await page.route('**/wp-json/wc/v3/products*', async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: {
				'x-wp-total': String(mockProducts.length),
				'x-wp-totalpages': '1',
			},
			body: JSON.stringify(mockProducts),
		});
	});

	await page.route('**/wp-json/wc/v3/customers*', async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: {
				'x-wp-total': String(mockCustomers.length),
				'x-wp-totalpages': '1',
			},
			body: JSON.stringify(mockCustomers),
		});
	});

	await page.route('**/wp-json/wc/v3/orders*', async (route: Route) => {
		const method = route.request().method();

		if (method === 'POST') {
			// Creating a new order
			const body = route.request().postDataJSON();
			const newOrder = {
				id: Math.floor(Math.random() * 10000),
				status: 'pending',
				...body,
			};
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify(newOrder),
			});
		} else {
			// Getting orders list
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: {
					'x-wp-total': String(mockOrders.length),
					'x-wp-totalpages': '1',
				},
				body: JSON.stringify(mockOrders),
			});
		}
	});

	await page.route('**/wp-json/wc/v3/taxes*', async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: {
				'x-wp-total': String(mockTaxRates.length),
				'x-wp-totalpages': '1',
			},
			body: JSON.stringify(mockTaxRates),
		});
	});

	// Mock store info endpoint
	await page.route('**/wp-json/wc/v3', async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(mockStore),
		});
	});
}
