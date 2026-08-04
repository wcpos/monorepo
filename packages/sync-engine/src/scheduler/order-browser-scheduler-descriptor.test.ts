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

	it('rejects unbounded completion and malformed epoch values', () => {
		for (const queryKey of [
			'orders:browser:status=all:search=:limit=all',
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
