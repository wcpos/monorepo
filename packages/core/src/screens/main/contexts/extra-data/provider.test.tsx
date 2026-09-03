/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { ExtraDataProvider } from './provider';

type EngineEvent = Record<string, unknown> & { type: string };
type MockResponse = { status: number; data: unknown };

function createMockEngine() {
	const listeners = new Set<(event: EngineEvent) => void>();
	return {
		listeners,
		events: (callback: (event: EngineEvent) => void) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
	};
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

let mockEngine = createMockEngine();
let mockGet: jest.Mock<Promise<MockResponse>, [string, { quietErrors?: boolean }?]> = jest.fn(
	async (_url: string) => ({
		status: 200,
		data: [],
	})
);
let mockHttp = { get: mockGet };
let mockExtraDataSet = jest.fn();
let mockExtraDataValues: Record<string, unknown> = {};
let mockExtraData = {
	get: (key: string) => mockExtraDataValues[key],
	set: mockExtraDataSet,
};
const mockUseRestHttpClient = jest.fn(() => mockHttp);

function emit(engine: ReturnType<typeof createMockEngine>, event: EngineEvent) {
	act(() => {
		for (const listener of [...engine.listeners]) listener(event);
	});
}

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		extraData: mockExtraData,
	});
	return { useAppState, useStoreSession: useAppState };
});
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockUseRestHttpClient(),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockEngine = createMockEngine();
	mockGet = jest.fn(async (_url: string) => ({ status: 200, data: [] }));
	mockHttp = { get: mockGet };
	mockExtraDataSet = jest.fn();
	mockExtraDataValues = {};
	mockExtraData = {
		get: (key: string) => mockExtraDataValues[key],
		set: mockExtraDataSet,
	};
});

describe('ExtraDataProvider API services', () => {
	it('fetches each resource on a cold start', async () => {
		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => Promise.resolve());

		expect(mockGet).toHaveBeenCalledWith('/taxes/classes');
		expect(mockGet).toHaveBeenCalledWith('/shipping_methods');
		expect(mockGet).toHaveBeenCalledWith('/data/order_statuses');
		expect(mockGet).toHaveBeenCalledWith('/payment-methods', { quietErrors: true });
		expect(mockGet).toHaveBeenCalledTimes(4);
	});

	it('revalidates payment-method capability on a warm start', async () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => Promise.resolve());

		emit(mockEngine, {
			type: 'lane-finish',
			lane: 'change-signal',
			status: 'ran',
		});

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('/payment-methods', { quietErrors: true });
	});

	it('revalidates a cached empty payment-method envelope on a warm start', async () => {
		mockExtraDataValues = {
			taxClasses: [],
			shippingMethods: [],
			orderStatuses: [],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => Promise.resolve());

		expect(mockGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('/payment-methods', { quietErrors: true });
	});

	it('consumes rejected resource requests', async () => {
		mockGet.mockRejectedValue(new Error('network unavailable'));

		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => {
			await Promise.resolve();
		});

		expect(mockExtraDataSet).not.toHaveBeenCalled();
	});

	it('keeps the cached payment methods when the store cannot be reached', async () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		// No `response`: the request never reached a server. An offline till has to
		// keep the tender checkout it was already working with.
		mockGet.mockRejectedValue(new Error('network unavailable'));

		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => Promise.resolve());

		expect(mockExtraDataSet).not.toHaveBeenCalled();
	});

	it('drops the cached payment methods when the store no longer serves the route', async () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		mockGet.mockRejectedValue(
			Object.assign(new Error('rest_no_route'), { response: { status: 404 } })
		);

		render(<ExtraDataProvider>content</ExtraDataProvider>);
		await act(async () => Promise.resolve());

		expect(mockExtraDataSet).toHaveBeenCalledTimes(1);
		expect(mockExtraDataSet).toHaveBeenCalledWith('paymentMethods', expect.any(Function));
		expect(mockExtraDataSet.mock.calls[0][1]()).toBeNull();
	});

	it('refetches all resources when the engine reports changed config', async () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		render(<ExtraDataProvider>content</ExtraDataProvider>);

		emit(mockEngine, { type: 'config-changed', collections: ['tax_rates'] });
		await act(async () => Promise.resolve());

		expect(mockGet).toHaveBeenCalledWith('/taxes/classes');
		expect(mockGet).toHaveBeenCalledWith('/shipping_methods');
		expect(mockGet).toHaveBeenCalledWith('/data/order_statuses');
		expect(mockGet).toHaveBeenCalledWith('/payment-methods', { quietErrors: true });
		expect(mockGet).toHaveBeenCalledTimes(5);
	});

	it('rebinds the event bridge to current store dependencies', async () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		const previousEngine = mockEngine;
		const previousGet = mockGet;
		const { rerender } = render(<ExtraDataProvider>content</ExtraDataProvider>);

		mockEngine = createMockEngine();
		mockGet = jest.fn(async (_url: string) => ({
			status: 200,
			data: ['current-store'],
		}));
		mockHttp = { get: mockGet };
		mockExtraDataSet = jest.fn();
		mockExtraData = {
			get: (key: string) => mockExtraDataValues[key],
			set: mockExtraDataSet,
		};
		act(() => rerender(<ExtraDataProvider>content</ExtraDataProvider>));

		emit(previousEngine, {
			type: 'config-changed',
			collections: ['tax_rates'],
		});
		expect(previousGet).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledTimes(1);

		emit(mockEngine, { type: 'config-changed', collections: ['tax_rates'] });
		expect(mockGet).toHaveBeenCalledTimes(5);
		await act(async () => {
			await Promise.resolve();
		});
		expect(mockExtraDataSet).toHaveBeenCalledTimes(4);
	});

	it('ignores responses superseded by a newer config refresh', async () => {
		const initialTaxClasses = createDeferred<{
			status: number;
			data: string[];
		}>();
		const currentTaxClasses = createDeferred<{
			status: number;
			data: string[];
		}>();
		let taxClassRequest = 0;
		mockExtraDataValues = {
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
			paymentMethods: { schema: 1, contract: '1.0', methods: [] },
		};
		mockGet.mockImplementation((url: string) => {
			if (url !== '/taxes/classes') return Promise.resolve({ status: 200, data: [] });
			taxClassRequest += 1;
			return taxClassRequest === 1 ? initialTaxClasses.promise : currentTaxClasses.promise;
		});
		render(<ExtraDataProvider>content</ExtraDataProvider>);

		emit(mockEngine, { type: 'config-changed', collections: ['tax_rates'] });
		await act(async () => {
			currentTaxClasses.resolve({ status: 200, data: ['current'] });
			await currentTaxClasses.promise;
			await Promise.resolve();
		});
		await act(async () => {
			initialTaxClasses.resolve({ status: 200, data: ['superseded'] });
			await initialTaxClasses.promise;
			await Promise.resolve();
		});

		const taxClassWrites = mockExtraDataSet.mock.calls.filter(([key]) => key === 'taxClasses');
		expect(taxClassWrites).toHaveLength(1);
		expect(taxClassWrites[0][1]()).toEqual(['current']);
	});
});
