/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { setOrders } from './test-utils';
import { PaymentsCard } from './payments';

import type { ReportOrder } from '../context';
it('the Payments card lists tenders with order counts', () => {
	setOrders([
		{ total: '20', payment_method: 'cash', payment_method_title: 'Cash' },
		{ total: '10', payment_method: 'cash', payment_method_title: 'Cash' },
	] as ReportOrder[]);
	render(<PaymentsCard />);
	expect(screen.getByTestId('card-payments-figure').textContent).toBe('£30.00');
	expect(screen.getByTestId('card-payments-donut-row-cash').textContent).toContain('2 orders');
	expect(screen.getByTestId('card-payments-donut-row-cash-value').textContent).toBe('£30.00');
});
