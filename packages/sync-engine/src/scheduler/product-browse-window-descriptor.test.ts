// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	normalizeProductBrowseWindowLimit,
	parseProductBrowseWindowDescriptor,
	parseProductBrowseWindowLimit,
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	productBrowseWindowPredecessorQueryKey,
	productBrowseWindowQueryKey,
	productBrowseWindowQueryKeyFromDimensions,
} from './product-browse-window-descriptor';
import { BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT } from './browse-window-continuation';

import type { ProductBrowseDimensions } from '../require-plane';

describe('productBrowseWindowQueryKeyFromDimensions', () => {
	it.each([
		[{}, 'products:browse-window:limit=100'],
		[{ limit: 110 }, 'products:browse-window:limit=200'],
		[
			{
				limit: 110,
				orderby: 'price',
				order: 'desc',
				category: [7, 2, 7],
				tag: [11, 3],
				brand: [13, 5],
				featured: true,
				on_sale: false,
				stock_status: 'instock',
			},
			'products:browse-window:limit=200:orderby=price:order=desc:category=2,7:tag=3,11:brand=5,13:featured=1:on_sale=0:stock_status=instock',
		],
	] satisfies [ProductBrowseDimensions, string][])('encodes and parses %s', (dims, expected) => {
		const queryKey = productBrowseWindowQueryKeyFromDimensions(dims);
		expect(queryKey).toBe(expected);
		expect(parseProductBrowseWindowDescriptor(queryKey)).not.toBeNull();
	});

	it('validates sort pairs at runtime', () => {
		expect(() => productBrowseWindowQueryKeyFromDimensions({ orderby: 'price' })).toThrow(
			TypeError
		);
		expect(() => productBrowseWindowQueryKeyFromDimensions({ order: 'desc' })).toThrow(TypeError);
		expect(() =>
			productBrowseWindowQueryKeyFromDimensions({ orderby: 'regular_price', order: 'asc' } as never)
		).toThrow(TypeError);
		expect(() =>
			productBrowseWindowQueryKeyFromDimensions({ orderby: 'price', order: 'sideways' } as never)
		).toThrow(TypeError);
		expect(() =>
			productBrowseWindowQueryKeyFromDimensions({ stock_status: 'lowstock' } as never)
		).toThrow(TypeError);
	});

	it('filters unsupported taxonomy ids before encoding', () => {
		const queryKey = productBrowseWindowQueryKeyFromDimensions({
			category: [-1, 0, 1.5, 2, Number.MAX_SAFE_INTEGER + 1],
			tag: [Number.NaN, 3, Number.POSITIVE_INFINITY],
			brand: [Number.NEGATIVE_INFINITY, 5],
		});

		expect(queryKey).toBe('products:browse-window:limit=100:category=2:tag=3:brand=5');
		expect(parseProductBrowseWindowDescriptor(queryKey)).not.toBeNull();
		expect(productBrowseWindowQueryKeyFromDimensions({ category: [0] })).toBe(
			'products:browse-window:limit=100'
		);
	});
});

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
	// #948 — and it keeps carrying it. This test used to pin the OPPOSITE contract
	// (`limit=1001` → null, `PRODUCT_BROWSE_WINDOW_MAX_LIMIT === 1000`). Paul overturned
	// that on 2026-08-06: “If a cashier wants to scroll past 200 orders, they better be
	// allowed to scroll past 200 orders.” The 1,000-row refusal is deliberately flipped —
	// a window is whatever the grid has scrolled to, and only the runaway backstop refuses.
	it('carries windows as far as the cashier scrolls, refusing only the runaway backstop', () => {
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=300')).toBe(300);
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=1000')).toBe(1000);
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=1100')).toBe(1100);
		expect(parseProductBrowseWindowLimit('products:browse-window:limit=25000')).toBe(25_000);
		expect(
			parseProductBrowseWindowLimit(
				`products:browse-window:limit=${BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT}`
			)
		).toBe(BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT);
		expect(
			parseProductBrowseWindowLimit(
				`products:browse-window:limit=${BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT + 1}`
			)
		).toBeNull();
	});

	// #948 — the killer property. Every scroll tick past the old ceiling has to mint a
	// DISTINCT key; a clamped key is deduped by the scheduler as work already done, which
	// is exactly how the grid used to dead-end in silence.
	it('mints a distinct key for every window past the old 1,000-row ceiling', () => {
		const keys = [1000, 1100, 1200, 4300].map((limit) =>
			productBrowseWindowQueryKeyFromDimensions({ limit })
		);
		expect(keys).toEqual([
			'products:browse-window:limit=1000',
			'products:browse-window:limit=1100',
			'products:browse-window:limit=1200',
			'products:browse-window:limit=4300',
		]);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.every((key) => parseProductBrowseWindowDescriptor(key) !== null)).toBe(true);
	});

	// #948 — the lane a growing window resumes from.
	it('names the predecessor window, preserving every other dimension', () => {
		expect(
			productBrowseWindowPredecessorQueryKey({ limit: 300, orderby: 'menu_order', order: 'asc' })
		).toBe('products:browse-window:limit=200');
		expect(
			productBrowseWindowPredecessorQueryKey({
				limit: 1100,
				orderby: 'price',
				order: 'desc',
				category: [2, 7],
				stock_status: 'instock',
			})
		).toBe(
			'products:browse-window:limit=1000:orderby=price:order=desc:category=2,7:stock_status=instock'
		);
		// The first window has nothing to continue from.
		expect(
			productBrowseWindowPredecessorQueryKey({ limit: 100, orderby: 'menu_order', order: 'asc' })
		).toBeNull();
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

	it.each(['sku', 'barcode', 'stock_quantity', 'stock_status'] as const)(
		'round-trips the WCPOS plugin %s sort through the query key',
		(orderby) => {
			const queryKey = productBrowseWindowQueryKeyFromDimensions({ orderby, order: 'asc' });
			expect(queryKey).toBe(`products:browse-window:limit=100:orderby=${orderby}:order=asc`);
			expect(parseProductBrowseWindowDescriptor(queryKey)).toEqual({
				limit: 100,
				orderby,
				order: 'asc',
			});
		}
	);

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

	it('rejects sorts outside the supported products orderby enum', () => {
		expect(
			parseProductBrowseWindowDescriptor(
				'products:browse-window:limit=100:orderby=regular_price:order=asc'
			)
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
		// #948: quantized, NOT clamped — 99,999 rows of demand is 100,000 rows of window,
		// not 1,000.
		expect(normalizeProductBrowseWindowLimit(99_999)).toBe(100_000);
		expect(normalizeProductBrowseWindowLimit(Number.MAX_SAFE_INTEGER)).toBe(
			BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT
		);
		expect(normalizeProductBrowseWindowLimit(undefined)).toBe(PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT);
	});
});
