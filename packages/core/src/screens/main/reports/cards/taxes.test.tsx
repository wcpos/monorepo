/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { setOrders } from './test-utils';
import { TaxesCard } from './taxes';

import type { ReportOrder } from '../context';

// A zero-rated period still names its rate; an unlabelled rate still reads as a tax.
it('a zero-rated period shows its rate with the net it applied to', () => {
	setOrders([
		{
			total: '50',
			total_tax: '0',
			tax_lines: [{ rate_id: 3, label: 'Zero rate', tax_total: '0' }],
			line_items: [{ total: '50', taxes: [{ id: 3, total: '0' }] }],
		},
	] as ReportOrder[]);
	render(<TaxesCard />);
	expect(screen.getByTestId('card-taxes').textContent).toContain('Zero rate');
	expect(screen.getByTestId('card-taxes').textContent).toContain('on £50.00');
});
it('an unlabelled rate without a code reads Tax', () => {
	setOrders([
		{ total: '12', total_tax: '2', tax_lines: [{ rate_id: 9, label: '', tax_total: '2' }] },
	] as ReportOrder[]);
	render(<TaxesCard />);
	expect(screen.getByTestId('card-taxes').textContent).toContain('Tax£2.00');
});
