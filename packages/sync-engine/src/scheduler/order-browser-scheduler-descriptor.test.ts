// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	browserOrderSchedulerDescriptorLimitError,
	ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS,
	parseOrderBrowserSchedulerDescriptor,
} from './order-browser-scheduler-descriptor';

describe('parseOrderBrowserSchedulerDescriptor', () => {
	it('classifies supported status-only descriptors with normalized Woo REST status', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=processing:search=:limit=150')
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=processing:search=:limit=150',
				status: 'processing',
				search: '',
				limit: 150,
				complete: false,
				wooStatus: 'processing',
			},
		});
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=all:search=:limit=50')
		).toEqual({
			descriptor: expect.objectContaining({ status: 'all', wooStatus: '', limit: 50 }),
		});
	});

	it('classifies supported search descriptors with normalized Woo REST status', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=processing:search=hat:limit=50')
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=processing:search=hat:limit=50',
				status: 'processing',
				search: 'hat',
				limit: 50,
				complete: false,
				wooStatus: 'processing',
			},
		});
	});

	it('parses ranged windowed and fetch-to-completion descriptors', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({
				afterSeconds: 1782864000,
				beforeSeconds: 1784073599,
				limit: 25,
				complete: false,
			}),
		});
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:after=1782864000:search=:limit=all'
			)
		).toEqual({
			descriptor: expect.objectContaining({ afterSeconds: 1782864000, complete: true }),
		});
	});

	it('parses customer descriptors with and without a range, including guest orders', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=processing:customer=42:search=:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({ customerId: 42, limit: 25, complete: false }),
		});
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:customer=0:after=1782864000:search=:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({
				customerId: 0,
				afterSeconds: 1782864000,
			}),
		});
	});

	it('parses cashier, store, and sort dimensions alone and combined', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=all:cashier=7:search=:limit=25')
		).toEqual({ descriptor: expect.objectContaining({ cashierId: 7 }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:store=woocommerce-pos:search=:limit=25'
			)
		).toEqual({ descriptor: expect.objectContaining({ store: 'woocommerce-pos' }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:orderby=modified:order=asc:search=:limit=25'
			)
		).toEqual({ descriptor: expect.objectContaining({ orderby: 'modified', order: 'asc' }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=processing:customer=42:cashier=7:store=12:after=1782864000:before=1784073599:orderby=date:order=desc:search=hat:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({
				search: 'hat',
				customerId: 42,
				cashierId: 7,
				store: '12',
				afterSeconds: 1782864000,
				beforeSeconds: 1784073599,
				orderby: 'date',
				order: 'desc',
			}),
		});
	});

	// Every structured dimension sits ahead of `:search=`, so a cashier searching for literal
	// `:customer=` / `:cashier=` / `:store=` / `:after=` / `:before=` / `:orderby=` text
	// round-trips as search text instead of silently becoming a filter or sort (or being
	// rejected outright and stalling the browse).
	it('keeps literal dimension tokens inside the search component', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=invoice:after=123:limit=25'
			)
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:search=invoice:after=123:limit=25',
				status: 'all',
				search: 'invoice:after=123',
				limit: 25,
				complete: false,
				wooStatus: '',
			},
		});
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=all:search=:before=nope:limit=25')
		).toEqual({
			descriptor: expect.objectContaining({ search: ':before=nope', limit: 25 }),
		});
		// A literal `:before=` INSIDE the search text does not become a second bound: the
		// range is read before `:search=`, everything after it is search text.
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:after=1782864000:search=x:before=9:limit=all'
			)
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:after=1782864000:search=x:before=9:limit=all',
				status: 'all',
				search: 'x:before=9',
				limit: ORDER_BROWSER_SCHEDULER_DESCRIPTOR_MAX_RECORDS,
				afterSeconds: 1782864000,
				complete: true,
				wooStatus: '',
			},
		});
		// Same for a literal `:customer=` in the search text — the dimension is read before
		// `:search=`, so this stays a search term and no customer filter reaches the wire.
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=all:search=:customer=7:limit=25')
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:search=:customer=7:limit=25',
				status: 'all',
				search: ':customer=7',
				limit: 25,
				complete: false,
				wooStatus: '',
			},
		});
		// …and for this PR's dimensions: `table:store=main`, `note:cashier=42` and a trailing
		// sort pair all stay search text, so no unintended filter or sort reaches the wire.
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=table:store=main:limit=25'
			)
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:search=table:store=main:limit=25',
				status: 'all',
				search: 'table:store=main',
				limit: 25,
				complete: false,
				wooStatus: '',
			},
		});
		// An applied cashier dimension and a literal `:cashier=` search term coexist: the
		// dimension is the one ahead of `:search=`, the search term stays verbatim.
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:cashier=7:search=note:cashier=42:limit=25'
			)
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:cashier=7:search=note:cashier=42:limit=25',
				status: 'all',
				search: 'note:cashier=42',
				cashierId: 7,
				limit: 25,
				complete: false,
				wooStatus: '',
			},
		});
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=hat:orderby=total:order=desc:limit=25'
			)
		).toEqual({
			descriptor: {
				queryKey: 'orders:browser:status=all:search=hat:orderby=total:order=desc:limit=25',
				status: 'all',
				search: 'hat:orderby=total:order=desc',
				limit: 25,
				complete: false,
				wooStatus: '',
			},
		});
	});

	it('rejects unbounded completion and malformed epoch values', () => {
		for (const queryKey of [
			'orders:browser:status=all:search=:limit=all',
			// A customer filter is a cashier-applied dimension, not a completion warrant:
			// only a date range authorises `limit=all` (fetch-to-completion stays reports-only).
			'orders:browser:status=all:customer=42:search=:limit=all',
			'orders:browser:status=all:after=-1:search=:limit=all',
			'orders:browser:status=all:after=1.5:search=:limit=all',
			'orders:browser:status=all:before=nope:search=:limit=25',
			'orders:browser:status=all:before=2:after=1:search=:limit=25',
		]) {
			expect(parseOrderBrowserSchedulerDescriptor(queryKey)).toEqual({
				skipReason: 'descriptor is not supported',
			});
		}
	});

	it('rejects malformed customer values', () => {
		for (const customer of ['-1', '1.5', 'nope', '9007199254740992']) {
			expect(
				parseOrderBrowserSchedulerDescriptor(
					`orders:browser:status=all:customer=${customer}:search=:limit=25`
				)
			).toEqual({ skipReason: 'descriptor is not supported' });
		}
	});

	it('rejects malformed cashier, store, and sort dimensions', () => {
		for (const dimension of [
			'cashier=-1',
			'cashier=1.5',
			'cashier=9007199254740992',
			'store=',
			'store=WCPOS',
			'store=bad:value',
			'store=bad=value',
			'orderby=date',
			'order=desc',
			'orderby=total:order=desc',
		]) {
			expect(
				parseOrderBrowserSchedulerDescriptor(
					`orders:browser:status=all:${dimension}:search=:limit=25`
				)
			).toEqual({ skipReason: 'descriptor is not supported' });
		}
	});

	it('classifies unsupported browser descriptors with stable skip reasons', () => {
		expect(parseOrderBrowserSchedulerDescriptor('orders:browser:v2:status=processing')).toEqual({
			skipReason: 'descriptor is not supported',
		});
		expect(parseOrderBrowserSchedulerDescriptor('orders:browser:status=:search=:limit=50')).toEqual(
			{
				skipReason: 'descriptor is not supported',
			}
		);
		expect(
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=processing:search=:limit=201')
		).toEqual({
			skipReason: browserOrderSchedulerDescriptorLimitError(),
		});
	});

	it('ignores query keys owned by other scheduler descriptor families', () => {
		expect(parseOrderBrowserSchedulerDescriptor('orders:ids:123')).toBeNull();
		expect(parseOrderBrowserSchedulerDescriptor('orders:custom-pull')).toBeNull();
		expect(
			parseOrderBrowserSchedulerDescriptor('products:browser:status=processing:search=:limit=50')
		).toBeNull();
	});
});
