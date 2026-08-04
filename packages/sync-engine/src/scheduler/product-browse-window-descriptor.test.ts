// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	normalizeProductBrowseWindowLimit,
	parseProductBrowseWindowDescriptor,
	parseProductBrowseWindowLimit,
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	PRODUCT_BROWSE_WINDOW_MAX_LIMIT,
	productBrowseWindowQueryKey,
} from './product-browse-window-descriptor';

describe('product browse-window descriptor', () => {
	it('builds and parses a limit-N browse-window query key', () => {
		const queryKey = productBrowseWindowQueryKey(100);
		expect(queryKey).toBe('products:browse-window:limit=100');
		expect(parseProductBrowseWindowLimit(queryKey)).toBe(100);
		expect(parseProductBrowseWindowDescriptor(queryKey)).toEqual({
			limit: 100,
			orderby: 'menu_order',
			order: 'asc',
		});
	});

	it('defaults the window to one Woo page of rows', () => {
		expect(PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT).toBe(100);
	});

	// #909 — the key carries the window the grid actually asked for.
	it('carries windows past a single Woo page, up to the window ceiling', () => {
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=300')).toBe(300);
		expect(parseProductBrowseWindowLimit(`products:browse-window:limit=1000`)).toBe(1000);
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=1001')).toBeNull();
		expect(PRODUCT_BROWSE_WINDOW_MAX_LIMIT).toBe(1000);
	});

	// #909 — the key carries the SORT, so a sort change re-seeds a server-sorted window.
	it('round-trips a non-default sort through the query key', () => {
		const queryKey = productBrowseWindowQueryKey(200, { orderby: 'price', order: 'desc' });
		expect(queryKey).toBe('products:browse-window:limit=200:orderby=price:order=desc');
		expect(parseProductBrowseWindowDescriptor(queryKey)).toEqual({
			limit: 200,
			orderby: 'price',
			order: 'desc',
		});
	});

	it.each([
		['category=2,7', { category: [2, 7] }],
		['tag=3,11', { tag: [3, 11] }],
		['brand=5,13', { brand: [5, 13] }],
		['featured=1', { featured: true }],
		['on_sale=0', { on_sale: false }],
		['stock_status=onbackorder', { stock_status: 'onbackorder' }],
	] as const)('parses the %s filter dimension', (dimension, parsed) => {
		expect(
			parseProductBrowseWindowDescriptor(`products:browse-window:limit=100:${dimension}`)
		).toEqual({
			limit: 100,
			orderby: 'menu_order',
			order: 'asc',
			...parsed,
		});
	});

	it('parses all filter dimensions after a non-default sort in canonical order', () => {
		expect(
			parseProductBrowseWindowDescriptor(
				'products:browse-window:limit=200:orderby=price:order=desc:category=2,7:tag=3,11:brand=5,13:featured=1:on_sale=0:stock_status=instock'
			)
		).toEqual({
			limit: 200,
			orderby: 'price',
			order: 'desc',
			category: [2, 7],
			tag: [3, 11],
			brand: [5, 13],
			featured: true,
			on_sale: false,
			stock_status: 'instock',
		});
	});

	it.each([
		'category=2,1',
		'category=2,2',
		'category=0,2',
		'featured=true',
		'on_sale=2',
		'stock_status=lowstock',
		'tag=3:category=2',
	])('rejects the non-canonical or invalid filter dimension %s', (dimension) => {
		expect(
			parseProductBrowseWindowDescriptor(`products:browse-window:limit=100:${dimension}`)
		).toBeNull();
	});

	it('gives the default sort exactly one spelling — the bare limit key', () => {
		expect(productBrowseWindowQueryKey(100, { orderby: 'menu_order', order: 'asc' })).toBe(
			'products:browse-window:limit=100'
		);
		// The long-hand default is not a second, competing lane identity.
		expect(
			parseProductBrowseWindowDescriptor(
				'products:browse-window:limit=100:orderby=menu_order:order=asc'
			)
		).toBeNull();
	});

	it('rejects sorts outside WC core’s products orderby enum', () => {
		expect(
			parseProductBrowseWindowDescriptor('products:browse-window:limit=100:orderby=sku:order=asc')
		).toBeNull();
		expect(
			parseProductBrowseWindowDescriptor(
				'products:browse-window:limit=100:orderby=price:order=sideways'
			)
		).toBeNull();
	});

	it('rejects non-browse-window keys, non-positive limits, and unparsable limits', () => {
		expect(parseProductBrowseWindowLimit('products:search:keyboard')).toBeNull();
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=0')).toBeNull();
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=x')).toBeNull();
	});

	// The grid extends its limit 10 rows at a time; the window quantizes so scrolling
	// does not mint a coverage lane per tick.
	it('quantizes a requested grid limit up to the next window step', () => {
		expect(normalizeProductBrowseWindowLimit(10)).toBe(100);
		expect(normalizeProductBrowseWindowLimit(100)).toBe(100);
		expect(normalizeProductBrowseWindowLimit(101)).toBe(200);
		expect(normalizeProductBrowseWindowLimit(250)).toBe(300);
		expect(normalizeProductBrowseWindowLimit(99_999)).toBe(PRODUCT_BROWSE_WINDOW_MAX_LIMIT);
		expect(normalizeProductBrowseWindowLimit(undefined)).toBe(PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT);
	});
});
