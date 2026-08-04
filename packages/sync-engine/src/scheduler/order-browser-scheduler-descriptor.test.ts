// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	browserOrderSchedulerDescriptorLimitError,
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
				'orders:browser:status=completed:search=:after=1782864000:before=1784073599:limit=25'
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
				'orders:browser:status=all:search=:after=1782864000:limit=all'
			)
		).toEqual({
			descriptor: expect.objectContaining({ afterSeconds: 1782864000, complete: true }),
		});
	});

	it('parses customer descriptors with and without a range, including guest orders', () => {
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=processing:search=:customer=42:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({ customerId: 42, limit: 25, complete: false }),
		});
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=:customer=0:after=1782864000:limit=25'
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
			parseOrderBrowserSchedulerDescriptor('orders:browser:status=all:search=:cashier=7:limit=25')
		).toEqual({ descriptor: expect.objectContaining({ cashierId: 7 }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=:store=woocommerce-pos:limit=25'
			)
		).toEqual({ descriptor: expect.objectContaining({ store: 'woocommerce-pos' }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=all:search=:orderby=modified:order=asc:limit=25'
			)
		).toEqual({ descriptor: expect.objectContaining({ orderby: 'modified', order: 'asc' }) });
		expect(
			parseOrderBrowserSchedulerDescriptor(
				'orders:browser:status=processing:search=hat:customer=42:cashier=7:store=12:after=1782864000:before=1784073599:orderby=date:order=desc:limit=25'
			)
		).toEqual({
			descriptor: expect.objectContaining({
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

	it('rejects unbounded completion and malformed epoch values', () => {
		for (const queryKey of [
			'orders:browser:status=all:search=:limit=all',
			'orders:browser:status=all:search=:customer=42:limit=all',
			'orders:browser:status=all:search=:after=-1:limit=all',
			'orders:browser:status=all:search=:after=1.5:limit=all',
			'orders:browser:status=all:search=:before=nope:limit=25',
			'orders:browser:status=all:search=:before=2:after=1:limit=25',
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
					`orders:browser:status=all:search=:customer=${customer}:limit=25`
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
					`orders:browser:status=all:search=:${dimension}:limit=25`
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
