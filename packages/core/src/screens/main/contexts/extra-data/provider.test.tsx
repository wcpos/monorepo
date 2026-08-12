/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { ExtraDataProvider } from './provider';

type EngineEvent = Record<string, unknown> & { type: string };

const listeners = new Set<(event: EngineEvent) => void>();
const mockGet = jest.fn(async () => ({ status: 200, data: [] }));
const mockExtraDataSet = jest.fn();
const mockUseRestHttpClient = jest.fn(() => ({ get: mockGet }));
let mockExtraDataValues: Record<string, unknown> = {};

const mockEngine = {
	events: (callback: (event: EngineEvent) => void) => {
		listeners.add(callback);
		return () => listeners.delete(callback);
	},
};

function emit(event: EngineEvent) {
	act(() => {
		for (const listener of [...listeners]) listener(event);
	});
}

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		extraData: {
			get: (key: string) => mockExtraDataValues[key],
			set: mockExtraDataSet,
		},
	}),
}));
jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => mockUseRestHttpClient(),
}));

beforeEach(() => {
	jest.clearAllMocks();
	listeners.clear();
	mockExtraDataValues = {};
});

describe('ExtraDataProvider API services', () => {
	it('fetches each resource on a cold start', () => {
		render(<ExtraDataProvider>content</ExtraDataProvider>);

		expect(mockUseRestHttpClient).toHaveBeenCalledTimes(1);
		expect(mockGet).toHaveBeenCalledWith('/taxes/classes');
		expect(mockGet).toHaveBeenCalledWith('/shipping_methods');
		expect(mockGet).toHaveBeenCalledWith('/data/order_statuses');
		expect(mockGet).toHaveBeenCalledTimes(3);
	});

	it('fetches nothing on a warm start for unrelated engine events', () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
		};
		render(<ExtraDataProvider>content</ExtraDataProvider>);

		emit({ type: 'lane-finish', lane: 'change-signal', status: 'ran' });

		expect(mockGet).not.toHaveBeenCalled();
	});

	it('refetches all resources when the engine reports changed config', () => {
		mockExtraDataValues = {
			taxClasses: [{ slug: 'standard' }],
			shippingMethods: [{ id: 'flat_rate' }],
			orderStatuses: [{ slug: 'pending' }],
		};
		render(<ExtraDataProvider>content</ExtraDataProvider>);

		emit({ type: 'config-changed', collections: ['tax_rates'] });

		expect(mockGet).toHaveBeenCalledWith('/taxes/classes');
		expect(mockGet).toHaveBeenCalledWith('/shipping_methods');
		expect(mockGet).toHaveBeenCalledWith('/data/order_statuses');
		expect(mockGet).toHaveBeenCalledTimes(3);
	});
});
