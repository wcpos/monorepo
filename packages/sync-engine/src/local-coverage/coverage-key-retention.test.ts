// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isBrowseWindowCoverageKey, retainedCoverageQueryKeys } from './coverage-key-retention';

const productWindow = (limit: number) => `products:browse-window:limit=${limit}`;
const orderWindow = (limit: number) => `orders:browser:status=all:search=:limit=${limit}`;

describe('isBrowseWindowCoverageKey', () => {
	it('recognises the three browse-window lane families', () => {
		expect(isBrowseWindowCoverageKey(productWindow(400))).toBe(true);
		expect(isBrowseWindowCoverageKey(orderWindow(200))).toBe(true);
		expect(isBrowseWindowCoverageKey('customers:browse-window:limit=200')).toBe(true);
	});

	it('recognises filtered and sorted windows, which are their own lanes', () => {
		expect(
			isBrowseWindowCoverageKey('products:browse-window:limit=400:orderby=price:order=desc')
		).toBe(true);
		expect(isBrowseWindowCoverageKey('products:browse-window:limit=400:category=7')).toBe(true);
		expect(
			isBrowseWindowCoverageKey('orders:browser:status=all:customer=12:search=:limit=100')
		).toBe(true);
	});

	/**
	 * THE SAFETY BOUNDARY. An orders SEARCH window records coverage through `recordRecords`,
	 * which writes records with `lanes: []` — its key never has a lane document at all. If
	 * this returned true, the very next write would prune a key that is absent BY DESIGN
	 * rather than because a deeper window superseded it.
	 */
	it('refuses the orders search window, whose coverage never writes a lane', () => {
		expect(isBrowseWindowCoverageKey('orders:browser:status=all:search=widget:limit=100')).toBe(
			false
		);
	});

	it('refuses every non-browse key that shares a collection prefix', () => {
		for (const key of [
			'products:search:widget',
			'products:targeted:woo-product:5',
			'orders:custom-pull',
			`${orderWindow(100)}:baseline-in-progress:task-1`,
			'orders:browser:status=all:after=1:search=:limit=all',
			'taxRates:all',
		]) {
			expect(isBrowseWindowCoverageKey(key), key).toBe(false);
		}
	});
});

describe('retainedCoverageQueryKeys', () => {
	/**
	 * THE RULING, as a unit. A record stamped by ten scroll ticks keeps only the window that
	 * still has a lane — which after #1032's eviction is exactly one.
	 */
	it('drops browse-window keys whose lane is gone', () => {
		const keys = [100, 200, 300, 400].map(productWindow);
		expect(retainedCoverageQueryKeys(keys, new Set([productWindow(400)]))).toEqual([
			productWindow(400),
		]);
	});

	it('keeps every live window when a record sits in more than one', () => {
		const keys = [productWindow(400), 'customers:browse-window:limit=200'];
		expect(retainedCoverageQueryKeys(keys, new Set(keys))).toEqual(keys);
	});

	/** Non-browse keys are retained unconditionally — they may never have had a lane. */
	it('never drops a key that is not a browse window, lane or no lane', () => {
		const keys = [
			'products:search:widget',
			'orders:browser:status=all:search=widget:limit=100',
			productWindow(100),
		];
		expect(retainedCoverageQueryKeys(keys, new Set())).toEqual([
			'products:search:widget',
			'orders:browser:status=all:search=widget:limit=100',
		]);
	});

	it('preserves order, so a record document does not churn on rewrite', () => {
		const keys = ['products:search:widget', productWindow(400), 'products:targeted'];
		expect(retainedCoverageQueryKeys(keys, new Set([productWindow(400)]))).toEqual(keys);
	});

	it('is a no-op when every key is live', () => {
		const keys = [productWindow(400), 'products:search:widget'];
		expect(retainedCoverageQueryKeys(keys, new Set(keys))).toEqual(keys);
	});
});
