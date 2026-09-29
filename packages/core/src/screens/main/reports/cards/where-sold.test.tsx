/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { mockState, setOrders } from './test-utils';
import { WhereSoldCard } from './where-sold';

import type { ReportOrder } from '../context';
beforeEach(() => {
	setOrders([{ total: '10' }] as ReportOrder[]);
	mockState.data.totals.registerArray = [
		{ registerId: 'abcdefgh-1234', totalAmount: 6, totalOrders: 1 },
		{ registerId: 'second-register', totalAmount: 4, totalOrders: 1 },
	];
	mockState.register = undefined;
	mockState.names = {};
	mockState.namesReady = true;
});
it('the view toggle appears only under All registers with more than one register', () => {
	const view = render(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-view')).toBeTruthy();
	mockState.register = 'abcdefgh-1234';
	view.rerender(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-view')).toBeNull();
	mockState.register = undefined;
	mockState.data.totals.registerArray = mockState.data.totals.registerArray.slice(0, 1);
	view.rerender(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-view')).toBeNull();
});
it('register names fall back to the short id', () => {
	render(<WhereSoldCard />);
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-registers'));
	expect(screen.getByTestId('card-where-sold-donut-row-abcdefgh-1234').textContent).toContain(
		'abcdefgh'
	);
});
it('register rows wait for names instead of showing blank labels', () => {
	mockState.namesReady = false;
	render(<WhereSoldCard />);
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-registers'));
	expect(screen.getByTestId('card-where-sold').querySelectorAll('[aria-busy]')).toHaveLength(2);
});
