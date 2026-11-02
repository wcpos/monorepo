/** @jest-environment jsdom */

import * as React from 'react';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import {
	mockCategories,
	mockCredentials,
	mockProducts,
	mockState,
	mockStores,
	setOrders,
} from '../cards/test-utils';
import {
	mockPrintDocument,
	mockRefundsHandle,
	mockSalesHandle,
	preparePanel,
	room,
} from './test-utils';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import { useReceiptDocument } from '../../receipt/use-receipt-document';

import type { buildReportDocument } from './document';
import type * as Context from '../context';

const mockPopover = jest.requireMock<typeof import('@wcpos/components/popover')>(
	'@wcpos/components/popover'
);

beforeEach(() => {
	preparePanel();
	mockState.storeFilter = '9';
	mockStores.next([]);
	// Expose menus at the existing native-popover boundary; MenuChip and rows stay real.
	jest
		.spyOn(mockPopover, 'PopoverContent')
		.mockImplementation(({ children, testID }) => <div data-testid={testID}>{children}</div>);
	mockCategories.next([]);
	mockSalesHandle.set({ ready: true, laneProgress: null });
	mockRefundsHandle.set({ ready: true, laneProgress: null });
	mockPrintDocument.templates = [{ id: 7, title: 'Sales', offline_capable: true }];
	mockPrintDocument.templatesReady = true;
	mockPrintDocument.allPrinters = [];
	mockPrintDocument.documentError = null;
	mockPrintDocument.print.mockReset().mockResolvedValue(true);
	mockCredentials.next([]);
	mockProducts.next([]);
	mockState.screenSize = 'lg';
	mockState.register = 'r';
	mockState.names = { r: 'Front' };
	mockState.from = mockState.to = '2026-07-15';
	setOrders([
		{ uuid: 'a', number: '42', total: '10', payment_method: 'cash', status: 'completed' },
	] as Context.ReportOrder[]);
	jest.mocked(saveOrShareCsv).mockReset().mockResolvedValue();
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
});
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
	expect(screen.getByTestId('receipt-preview-frame')).toBeTruthy();
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
// A figure report is already the sheet; Print must not open a second dialog.
it.each(['lg', 'sm'])('opens the paper directly and prints from its footer on %s', async (size) => {
	mockState.screenSize = size;
	mockPrintDocument.templates.push({ id: 8, title: 'Thermal sales', offline_capable: true });
	mockPrintDocument.allPrinters = [{ id: 'front', name: 'Front printer' }];
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('receipt-preview-frame')).toBeTruthy();
	expect(!!screen.queryByTestId('receipt-flow-preview')).toBe(size === 'sm');
	expect(screen.queryByTestId('detail-panel-print-sheet')).toBeNull();
	expect(screen.queryByTestId('detail-panel-body')).toBeNull();
	const footer = within(screen.getByTestId('detail-panel-footer'));
	expect(footer.getByTestId('detail-panel-export').dataset.variant).toBe('outline');
	expect(footer.getByTestId('detail-panel-print').dataset.variant).toBe('default');
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 orders · £10.00');
	expect(
		within(screen.getByTestId('print-sheet-template')).getByTestId('receipt-template-select')
	).toBeTruthy();
	expect(
		within(screen.getByTestId('print-sheet-printer')).getByTestId('receipt-printer-select')
	).toBeTruthy();
	expect(mockPrintDocument.print).not.toHaveBeenCalled();
	fireEvent.click(footer.getByTestId('detail-panel-print'));
	await waitFor(() => expect(mockPrintDocument.print).toHaveBeenCalledTimes(1));
	expect(screen.queryByTestId('detail-panel-print-sheet')).toBeNull();
});
it.each(['lg', 'sm'])('Orders keeps its list and opens the sheet on Print on %s', (size) => {
	mockState.screenSize = size;
	room();
	fireEvent.click(screen.getByTestId('card-orders-open'));
	expect(screen.getByTestId('orders-list')).toBeTruthy();
	expect(screen.queryByTestId('receipt-preview-frame')).toBeNull();
	fireEvent.click(screen.getByTestId('detail-panel-print'));
	expect(mockPrintDocument.print).not.toHaveBeenCalled();
	expect(
		within(screen.getByTestId('detail-panel-print-sheet')).getByTestId('receipt-preview-frame')
	).toBeTruthy();
	fireEvent.click(screen.getByTestId('detail-panel-print-sheet-close'));
	expect(screen.queryByTestId('detail-panel-print-sheet')).toBeNull();
	expect(screen.getByTestId('orders-list')).toBeTruthy();
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
// Each gate prevents a blank/incomplete report; its reason must be visible, not a dead button.
it('Print waits for the templates with a reason', () => {
	mockPrintDocument.templatesReady = false;
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect((screen.getByTestId('detail-panel-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading templates');
	fireEvent.click(screen.getByTestId('detail-panel-print'));
	expect(mockPrintDocument.print).not.toHaveBeenCalled();
});

it.each(['categories', 'cashiers', 'orders'])(
	"Print waits for the panel's data: %s",
	async (panel) => {
		room();
		const open = screen.getByTestId(`card-${panel}-open`);
		act(() => {
			mockProducts.next(undefined);
			mockCredentials.next(undefined);
			fireEvent.click(open);
		});
		if (panel === 'orders') fireEvent.click(screen.getByTestId('detail-panel-print'));
		const printID = panel === 'orders' ? 'print-sheet-print' : 'detail-panel-print';
		expect((screen.getByTestId(printID) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading the report');
		await act(async () => {
			mockProducts.next([]);
			mockCredentials.next([]);
		});
		await waitFor(() =>
			expect((screen.getByTestId(printID) as HTMLButtonElement).disabled).toBe(false)
		);
	}
);
it('no local template is said, not silently disabled', () => {
	mockPrintDocument.templates = [];
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect((screen.getByTestId('detail-panel-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe(
		'No template can print offline · manage templates in WP Admin'
	);
});
it('a print that resolves false or rejects shows the message', async () => {
	mockPrintDocument.print
		.mockResolvedValueOnce(false)
		.mockRejectedValueOnce(new Error('printer unavailable'));
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	for (let attempt = 0; attempt < 2; attempt++) {
		fireEvent.click(screen.getByTestId('detail-panel-print'));
		await waitFor(() =>
			expect(screen.getByTestId('print-sheet-error').textContent).toBe(
				'Could not print. Try again.'
			)
		);
	}
	fireEvent.click(screen.getByTestId('detail-panel-print'));
	await waitFor(() => expect(screen.queryByTestId('print-sheet-error')).toBeNull());
});
it('shows a document error in the print sheet', () => {
	mockPrintDocument.documentError = new Error('document unavailable');
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('print-sheet-error').textContent).toBe('document unavailable');
});

it('Print waits while the orders lane is still downloading, and for a printer that can print the template', () => {
	mockSalesHandle.set({ laneProgress: { downloaded: 40, total: 100 } });
	room();
	fireEvent.click(screen.getByTestId('card-taxes-open'));
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe(
		'Still loading orders for this range'
	);
	act(() => mockSalesHandle.set({ laneProgress: null }));
	mockPrintDocument.mismatch = 'html-template-prints-default-layout';
	mockPrintDocument.resolvedPrinter = { id: 'raw-printer' };
	fireEvent.click(screen.getByTestId('detail-panel-close'));
	fireEvent.click(screen.getByTestId('card-taxes-open'));
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe(
		'The saved printer cannot print this template'
	);
	mockPrintDocument.mismatch = null;
	mockPrintDocument.resolvedPrinter = null;
});
it('the footer names the items missing a cost', () => {
	setOrders([
		{
			uuid: 'a',
			status: 'completed',
			total: '150',
			cost_of_goods_sold: {},
			line_items: [
				{ product_id: 1, total: '100', quantity: 2, cost_of_goods_sold: { value: 25 } },
				{ product_id: 2, total: '50', quantity: 1.5 },
			],
		},
	] as Context.ReportOrder[]);
	room();
	fireEvent.click(screen.getByTestId('card-products-open'));
	expect(screen.getByTestId('detail-panel-cost-missing').textContent).toBe(
		'1 orders · £150.00 · cost missing on 1.5 of 3.5 items'
	);
});
// A first local refund emission is not evidence that all refund pages have arrived.
it.each(['refunds', 'products', 'categories', 'brands'])(
	'waits for refund download progress before printing panels: %s',
	async (panel) => {
		mockRefundsHandle.set({ laneProgress: { downloaded: 40, total: 100 } });
		setOrders([
			{ uuid: 'a', status: 'completed', total: '10', cost_of_goods_sold: {} },
		] as Context.ReportOrder[]);
		room();
		fireEvent.click(screen.getByTestId(`card-${panel}-open`));
		expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
		expect(screen.getByTestId('print-sheet-waiting').textContent).toBe(
			'Still loading refunds for this range'
		);
		fireEvent.click(screen.getByTestId('detail-panel-print'));
		expect(mockPrintDocument.print).not.toHaveBeenCalled();
		await act(async () => mockRefundsHandle.set({ laneProgress: null }));
		expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(false);
		fireEvent.click(screen.getByTestId('detail-panel-print'));
		await waitFor(() => expect(mockPrintDocument.print).toHaveBeenCalledTimes(1));
	}
);
// The refunds read has not answered (or failed): the room shows the report without
// `periodRefunds` (and no refunds card to open). The grouped panels net refunds and would
// print gross figures, so they wait.
it.each(['products', 'categories', 'brands'])(
	'Print waits for the refunds read on a panel that nets refunds: %s',
	(panel) => {
		mockRefundsHandle.set({ ready: false, laneProgress: { downloaded: 40, total: 100 } });
		setOrders([
			{ uuid: 'a', status: 'completed', total: '10', cost_of_goods_sold: {} },
		] as Context.ReportOrder[]);
		mockState.data.periodRefunds = undefined;
		room();
		fireEvent.click(screen.getByTestId(`card-${panel}-open`));
		expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
		expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading the report');
	}
);
it('a panel that does not net refunds prints without the refunds read', () => {
	mockRefundsHandle.set({ ready: false, laneProgress: { downloaded: 40, total: 100 } });
	mockState.data.periodRefunds = undefined;
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.queryByTestId('print-sheet-waiting')).toBeNull();
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(false);
});
it('does not wait for refund downloads when printing payments', () => {
	mockRefundsHandle.set({ laneProgress: { downloaded: 40, total: null } });
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(false);
});
it('the Registers panel waits for the register names before Export and Print', () => {
	mockState.register = undefined;
	mockState.namesReady = false;
	mockState.names = {};
	setOrders([
		{
			uuid: 'a',
			total: '10',
			status: 'completed',
			created_via: 'woocommerce-pos',
			meta_data: [{ key: '_wcpos_register', value: 'r' }],
		},
		{
			uuid: 'b',
			total: '5',
			status: 'completed',
			created_via: 'woocommerce-pos',
			meta_data: [{ key: '_wcpos_register', value: 's' }],
		},
	] as Context.ReportOrder[]);
	room();
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-registers'));
	fireEvent.click(screen.getByTestId('card-where-sold-open'));
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading the report');
	expect(screen.queryByTestId('detail-panel-export')).toBeNull();
	mockState.namesReady = true;
});

// Concurrent failures belong to separate actions; neither may mask the other.
it('shows an export failure followed by a print failure as independent lines', async () => {
	let failPrint!: (error: Error) => void;
	mockPrintDocument.print.mockImplementationOnce(
		() =>
			new Promise<boolean>((_resolve, reject) => {
				failPrint = reject;
			})
	);
	jest.mocked(saveOrShareCsv).mockRejectedValueOnce(new Error('disk full'));
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	fireEvent.click(screen.getByTestId('detail-panel-print'));
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(screen.getByTestId('detail-panel-export-error').textContent).toBe(
			'Export failed. Try again.'
		)
	);
	expect(screen.queryByTestId('print-sheet-error')).toBeNull();
	await act(async () => failPrint(new Error('printer unavailable')));
	expect(screen.getByTestId('detail-panel-export-error').textContent).toBe(
		'Export failed. Try again.'
	);
	expect(screen.getByTestId('print-sheet-error').textContent).toBe('Could not print. Try again.');
	expect(screen.getByTestId('detail-panel-export-error').parentElement).toBe(
		screen.getByTestId('print-sheet-error').parentElement
	);
});

it('clears an old export error when a new print attempt starts', async () => {
	jest.mocked(saveOrShareCsv).mockRejectedValueOnce(new Error('disk full'));
	mockPrintDocument.print.mockResolvedValueOnce(false);
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() => expect(screen.getByTestId('detail-panel-export-error')).toBeTruthy());
	fireEvent.click(screen.getByTestId('detail-panel-print'));
	expect(screen.queryByTestId('detail-panel-export-error')).toBeNull();
	await waitFor(() =>
		expect(screen.getByTestId('print-sheet-error').textContent).toBe('Could not print. Try again.')
	);
});

it("a single-store install's sentinel scope is not All stores", () => {
	mockState.storeFilter = 'woocommerce-pos';
	mockStores.next([{ id: 9, name: 'Shop' }]);
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('detail-panel-scope').textContent).toBe('Today · Wed 15 Jul · Front');
});
it('the Stores panel waits for store names before Export and Print', () => {
	mockState.storeFilter = 'woocommerce-pos';
	mockState.register = undefined;
	mockStores.next([
		{ id: 7, name: 'Front shop' },
		{ id: 9, name: 'Back shop' },
	]);
	room();
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-stores'));
	// The card has names; the newly mounted panel must wait for its own directory read.
	act(() => mockStores.next(PENDING_USER_DB_READ));
	fireEvent.click(screen.getByTestId('card-where-sold-open'));
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
	expect(screen.queryByTestId('detail-panel-export')).toBeNull();
	expect(screen.getByTestId('print-sheet-waiting').textContent).toBe('Loading the report');
	act(() =>
		mockStores.next([
			{ id: 7, name: 'Front shop' },
			{ id: 9, name: 'Back shop' },
		])
	);
	expect(screen.getByTestId('detail-panel-export')).toBeTruthy();
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(false);
	expect(screen.getByTestId('detail-panel-scope').textContent).toContain('All stores');
});
function productsFixture(withBrands = true) {
	mockProducts.next([
		{ id: 1, categories: [{ id: 11 }], brands: withBrands ? [{ id: 7, name: 'Acme' }] : [] },
		{ id: 2, categories: [{ id: 12 }] },
	]);
	mockCategories.next([
		{ id: 10, name: 'Clothes', parent: 0 },
		{ id: 11, name: 'Shirts', parent: 10 },
		{ id: 12, name: 'Hats', parent: 10 },
	]);
	setOrders([
		{
			uuid: 'a',
			status: 'completed',
			total: '36',
			line_items: [
				{ product_id: 1, name: 'Shirt', total: '10', total_tax: '2', quantity: 1 },
				{ product_id: 2, name: 'Hat', total: '20', total_tax: '4', quantity: 2 },
			],
		},
	] as Context.ReportOrder[]);
}
function reportDocument() {
	return jest.mocked(useReceiptDocument).mock.calls.at(-1)![0].localReport!.report as ReturnType<
		typeof buildReportDocument
	>['report'];
}
it.each(['products', 'categories', 'payments'])(
	'only Products has the panel filter row: %s',
	(panel) => {
		productsFixture();
		room();
		fireEvent.click(screen.getByTestId(`card-${panel}-open`));
		expect(!!screen.queryByTestId('detail-panel-filters')).toBe(panel === 'products');
		if (panel === 'products') expect(screen.getByTestId('detail-panel-brand')).toBeTruthy();
	}
);
it('omits the Brand chip when no joined product has a brand', () => {
	productsFixture(false);
	room();
	fireEvent.click(screen.getByTestId('card-products-open'));
	expect(screen.getByTestId('detail-panel-category')).toBeTruthy();
	expect(screen.queryByTestId('detail-panel-brand')).toBeNull();
});
it('filters product rows, scope, footer and CSV through the category menu, then clears', async () => {
	productsFixture();
	room();
	fireEvent.click(screen.getByTestId('card-products-open'));
	expect(reportDocument().rows.map((row) => row.label)).toEqual(['Hat', 'Shirt']);
	fireEvent.click(screen.getByTestId('detail-panel-category'));
	fireEvent.click(screen.getByTestId('detail-panel-category-11'));
	expect(reportDocument().rows.map((row) => row.label)).toEqual(['Shirt']);
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 products · £12.00');
	expect(screen.getByTestId('detail-panel-scope').textContent).toBe(
		'Today · Wed 15 Jul · Front · Clothes › Shirts'
	);
	expect(reportDocument().scope.label).toBe('Today · Wed 15 Jul · Front · Clothes › Shirts');
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(saveOrShareCsv).toHaveBeenCalledWith(
			'"Product","Qty","Amount"\r\n"Shirt","1","£12.00"\r\n"All products","1","£12.00"',
			'sales-products-2026-07-15-2026-07-15.csv'
		)
	);
	fireEvent.click(screen.getByTestId('detail-panel-category-clear'));
	expect(reportDocument().rows.map((row) => row.label)).toEqual(['Hat', 'Shirt']);
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 orders · £36.00');
	expect(screen.getByTestId('detail-panel-scope').textContent).toBe('Today · Wed 15 Jul · Front');
});
it('intersects Brand with Category, nets refunds and counts only filtered missing costs', () => {
	productsFixture();
	mockState.data.allOrders[0].cost_of_goods_sold = {};
	mockState.data.periodRefunds = [
		{
			id: 9,
			parent_id: 1,
			date_created_gmt: '2026-07-15T12:00:00',
			line_items: [
				{ product_id: 1, name: 'Shirt', total: '-5', total_tax: '-1', quantity: -0.5 },
				{ product_id: 2, name: 'Hat', total: '-10', total_tax: '-2', quantity: -1 },
			],
		},
	];
	room();
	fireEvent.click(screen.getByTestId('card-products-open'));
	fireEvent.click(screen.getByTestId('detail-panel-category-10'));
	fireEvent.click(screen.getByTestId('detail-panel-brand-7'));
	expect(reportDocument().rows.map((row) => row.label)).toEqual(['Shirt']);
	expect(screen.getByTestId('detail-panel-cost-missing').textContent).toBe(
		'1 products · £6.00 · cost missing on 1.5 of 1.5 items'
	);
	expect(reportDocument().scope.label).toBe('Today · Wed 15 Jul · Front · Clothes · Acme');
	fireEvent.click(screen.getByTestId('detail-panel-close'));
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 orders · £36.00');
	fireEvent.click(screen.getByTestId('detail-panel-close'));
	fireEvent.click(screen.getByTestId('card-products-open'));
	expect(reportDocument().rows).toHaveLength(2);
	expect(screen.queryByTestId('detail-panel-category-clear')).toBeNull();
	expect(screen.queryByTestId('detail-panel-brand-clear')).toBeNull();
});
it('waits for the category tree before exporting or printing Products', async () => {
	productsFixture();
	mockCategories.next(undefined);
	room();
	fireEvent.click(screen.getByTestId('card-products-open'));
	expect(screen.queryByTestId('detail-panel-export')).toBeNull();
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(true);
	await act(async () => mockCategories.next([{ id: 11, name: 'Shirts', parent: 0 }]));
	expect(screen.getByTestId('detail-panel-export')).toBeTruthy();
	expect(screen.getByTestId('detail-panel-print').hasAttribute('disabled')).toBe(false);
});
