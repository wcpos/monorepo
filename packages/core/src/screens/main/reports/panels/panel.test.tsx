/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { mockState, setOrders } from '../cards/test-utils';
import { Reports } from '../reports';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import { ReportRows } from './report-rows';

import type * as Context from '../context';

// Native portal/animation primitives are not transformed by this Jest preset; keep shell state real.
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/components/dialog', () => {
	const Close = React.createContext(() => {});
	return {
		DialogTitle: ({ children }: React.PropsWithChildren) => <div role="heading">{children}</div>,
		Dialog: ({
			children,
			onOpenChange,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
			<Close.Provider value={() => onOpenChange(false)}>{children}</Close.Provider>
		),
		DialogContent: ({
			children,
			closeButtonProps,
			side,
			portalHost,
		}: React.PropsWithChildren<{
			closeButtonProps: { testID: string };
			side: string;
			portalHost: string;
		}>) => (
			<div data-testid="dialog-shell" data-side={side} data-host={portalHost}>
				{children}
				<button data-testid={closeButtonProps.testID} onClick={React.useContext(Close)} />
			</div>
		),
	};
});
jest.mock('@wcpos/components/table', () => {
	const tags = {
		Table: 'table',
		TableHeader: 'thead',
		TableHead: 'th',
		TableBody: 'tbody',
		TableRow: 'tr',
		TableCell: 'td',
		TableFooter: 'tfoot',
	};
	return Object.fromEntries(
		Object.entries(tags).map(([name, tag]) => [
			name,
			({
				children,
				testID,
				className,
			}: React.PropsWithChildren<{ testID?: string; className?: string }>) =>
				React.createElement(tag, { 'data-testid': testID, className }, children),
		])
	);
});
jest.mock('../closures/save-or-share-csv', () => ({ saveOrShareCsv: jest.fn(async () => {}) }));
jest.mock('../hero', () => ({ Hero: () => <div data-testid="hero-total">Hero</div> }));
jest.mock('../sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'r', registerName: 'Front' }),
}));
const context = jest.requireMock<typeof Context>('../context');
const real = jest.requireActual<typeof Context>('../context');
beforeEach(() => {
	jest.spyOn(context, 'useReportsScope').mockImplementation(real.useReportsScope);
	mockState.screenSize = 'lg';
	mockState.register = 'r';
	mockState.names = { r: 'Front' };
	mockState.from = mockState.to = '2026-07-15';
	setOrders([
		{ uuid: 'a', number: '42', total: '10', payment_method: 'cash' },
	] as Context.ReportOrder[]);
	jest.mocked(saveOrShareCsv).mockReset().mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());
const room = () =>
	render(
		<real.ReportsScopeProvider>
			<Reports title="Sales" />
		</real.ReportsScopeProvider>
	);
// Losing shell scope/count, wrong export inputs, or leaving the hero mounted on phone breaks these.
it('opens the payments panel with its title, scope line and footer count', async () => {
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('dialog-shell').dataset).toMatchObject({
		side: 'right',
		host: 'reports',
	});
	expect(screen.getByTestId('detail-panel').textContent).toContain('Sales by payment method');
	expect(screen.getByTestId('detail-panel-scope').textContent).toBe('Today · Wed 15 Jul · Front');
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 orders · £10.00');
	expect(within(screen.getByTestId('detail-panel-body')).getByText('Cash')).toBeTruthy();
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(saveOrShareCsv).toHaveBeenCalledWith(
			'"Method","Orders","Amount","Share"\r\n"Cash","1","£10.00","100.0%"\r\n"Total","1","£10.00",""',
			'sales-payments-2026-07-15-2026-07-15.csv'
		)
	);
	fireEvent.click(screen.getByTestId('detail-panel-close'));
	expect(screen.queryByTestId('detail-panel')).toBeNull();
});
it('the phone page shows the crumb and returns on back', () => {
	mockState.screenSize = 'sm';
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.queryByTestId('hero-total')).toBeNull();
	expect(screen.getByTestId('detail-panel-crumb').textContent).toContain('Sales');
	expect(screen.queryByTestId('detail-panel-close')).toBeNull();
	fireEvent.click(screen.getByTestId('detail-panel-back'));
	expect(screen.getByTestId('hero-total')).toBeTruthy();
	expect(screen.queryByTestId('detail-panel-body')).toBeNull();
});
it('an export failure shows the message', async () => {
	jest.mocked(saveOrShareCsv).mockRejectedValue(new Error('disk full'));
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(screen.getByTestId('detail-panel-export-error').textContent).toBe(
			'Export failed. Try again.'
		)
	);
});
it('renders labelled phone rows and a period-neutral empty line', () => {
	mockState.screenSize = 'sm';
	const spec = {
		head: ['Product', 'Qty', 'Amount'],
		rows: [{ key: 'one', cells: ['Tea', '1.5', '£3.00'] }],
		total: ['All products', '1.5', '£3.00'],
		align: ['left', 'right', 'right'] as const,
	};
	const view = render(<ReportRows spec={{ ...spec, align: [...spec.align] }} testID="rows" />);
	expect(screen.getByTestId('rows-row-one').textContent).toBe('TeaQty1.5Amount£3.00');
	expect(screen.getByTestId('rows-total').textContent).toBe('All products£3.00');
	view.rerender(<ReportRows spec={{ ...spec, align: [...spec.align], rows: [] }} testID="rows" />);
	expect(screen.getByText('Nothing in this period')).toBeTruthy();
});
