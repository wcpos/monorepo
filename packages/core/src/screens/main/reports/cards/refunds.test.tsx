/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { mockState, setOrders } from './test-utils';
import { RefundsCard } from './refunds';

import type { ReportOrder } from '../context';
// Treating undefined as an empty result hides loading; reading embedded refunds gives the wrong amount.
it('the skeleton until the refunds emit', () => {
	setOrders([]);
	mockState.data.periodRefunds = undefined;
	render(<RefundsCard />);
	expect(screen.getByTestId('card-refunds-loading')).toBeTruthy();
	expect(screen.queryByTestId('card-refunds-refunded')).toBeNull();
});
it('the figures once they do', () => {
	setOrders([{ total: '100', refunds: [{ total: '-90' }] }] as ReportOrder[]);
	const view = render(<RefundsCard />);
	mockState.data.periodRefunds = [{ id: 1, parent_id: 5, date_created_gmt: '', amount: '25' }];
	view.rerender(<RefundsCard />);
	expect(screen.getByTestId('card-refunds-refunded').textContent).toBe('£25.00');
	expect(screen.getByTestId('card-refunds-orders').textContent).toBe('1 of 1');
	expect(screen.getByTestId('card-refunds-kept').textContent).toBe('75.0%');
});
