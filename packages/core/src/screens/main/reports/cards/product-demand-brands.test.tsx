/** @jest-environment jsdom */
import * as React from 'react';

import { act, screen } from '@testing-library/react';

import { demandRecordsByWooId } from '@wcpos/query/record-readers';

import { mockProducts, mockState, render, setOrders } from './test-utils';
import { REPORT_PRODUCT_DEMAND_DEBOUNCE_MS } from './use-report-product-demand';
import { PeriodSection } from './index';

import type { ReportOrder } from '../context';

jest.mock('@wcpos/query/record-readers', () => ({ demandRecordsByWooId: jest.fn() }));
jest.mock('@wcpos/query/query-state', () => ({
	...jest.requireActual('@wcpos/query/query-state'),
	useCoverageGeneration: () => 0,
}));

// The real demand under the card harness (online there): what the store returns on open reaches
// the Brands card.
it('a product fetched on open shows under its brand', async () => {
	jest.useFakeTimers();
	mockState.realProductDemand = true;
	mockState.linesLoaded = true;
	setOrders([
		{
			id: 1,
			uuid: 'sale',
			total: '30',
			status: 'completed',
			line_items: [
				{ product_id: 77, name: 'Boot', quantity: 1, total: '20' },
				{ product_id: 78, name: 'Sock', quantity: 1, total: '10' },
			],
		},
	] as ReportOrder[]);
	mockProducts.next([{ id: 78, brands: [{ id: 31, name: 'Local' }] }]);
	(demandRecordsByWooId as jest.Mock).mockImplementation(() => {
		mockProducts.next([
			...(mockProducts.value ?? []),
			{ id: 77, brands: [{ id: 30, name: 'Fetched' }] },
		]);
		return { ready: Promise.resolve('settled'), release: jest.fn() };
	});
	try {
		render(<PeriodSection />);
		// Before the fetch, the line sits in the unknown-product bucket.
		expect(screen.getByTestId('card-brands-donut-row-unknown')).toBeTruthy();
		expect(screen.queryByTestId('card-brands-donut-row-30')).toBeNull();
		await act(async () => {
			jest.advanceTimersByTime(REPORT_PRODUCT_DEMAND_DEBOUNCE_MS);
		});
		expect(demandRecordsByWooId).toHaveBeenCalledTimes(1);
		expect((demandRecordsByWooId as jest.Mock).mock.calls[0][1].wooIds).toEqual([77]);
		expect(screen.getByTestId('card-brands-donut-row-30').textContent).toContain('Fetched');
		expect(screen.queryByTestId('card-brands-donut-row-unknown')).toBeNull();
	} finally {
		jest.useRealTimers();
	}
});
