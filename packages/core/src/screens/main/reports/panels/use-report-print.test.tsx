/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { createTestT } from '../../../../../jest/translate';
import { salesFigures } from '../report/sales-figures';
import { ReportsDirectoriesProvider, ReportsFilterScopeProvider } from '../scope';
import { panelSpec } from './specs';
import { useReportPrint } from './use-report-print';
import fixture from './__fixtures__/report-sales.json';

import type { ReportOrder } from '../context';

const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle');

const mockSales = fakeQueryHandle({}, 'sales');
const mockRefunds = fakeQueryHandle({}, 'refunds');
const mockStores = new BehaviorSubject<{ id: number; name: string }[]>([]);
const mockState = {
	store: { id: 9 } as object | undefined,
	filters: { register: 'r', store: '9' } as { register?: string; store?: string },
	names: { r: 'Front' } as Record<string, string>,
};
const mockDoc = {
	templatesReady: true,
	templates: [{ id: 7 }],
	mismatch: null as string | null,
	resolvedPrinter: null as { id: string } | null,
	documentError: null as Error | null,
	print: jest.fn<Promise<boolean>, []>(),
};
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: jest.fn(() => mockDoc),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../context', () => ({
	useReportsPeriod: () => ({
		dateRange: {
			start: new Date('2026-07-15T00:00:00Z'),
			end: new Date('2026-07-15T23:59:59Z'),
		},
		timezone: 'UTC',
		storeId: 9,
	}),
	useReportsHandles: () => ({ handle: mockSales, refundsHandle: mockRefunds }),
}));
jest.mock('../use-report-formats', () => ({
	useReportFormats: () => ({ store: mockState.store }),
}));
jest.mock('../date-button', () => ({
	periodLabel: ({ scope }: { scope: { from: string; to: string } }) => ({
		text: scope.from === scope.to ? `Today ${scope.from}` : `${scope.from}–${scope.to}`,
	}),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useStoreDay: () => ({ presets: () => [] }),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: jest.fn() }),
}));
jest.mock('../../../../query', () => ({
	useQueryState: () => ({ filters: mockState.filters }),
	useQueryHandleFields: (...args: unknown[]) =>
		jest.requireActual('@wcpos/query/query-state').useQueryHandleFields(...args),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => mockState.names,
	useRegisterNamesReady: () => true,
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'bound', registerName: 'Bound till' }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: {} }),
}));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeCredentialStores: () => mockStores,
	observeSiteCredentials: () => of([]),
}));
jest.mock('../../../../services/register-session/use-closure-document-context', () => ({
	useClosureDocumentContext: () => ({
		store: { name: 'Shop' },
		currency: 'GBP',
		timezone: 'UTC',
		locale: 'en-GB',
		printedAt: '2026-07-15T13:00:00Z',
		formatMoney: String,
		i18n: jest.requireActual('./__fixtures__/report-sales.json').i18n,
	}),
}));

const orders = [{ uuid: 'one', total: '10', payment_method: 'cash' }] as ReportOrder[];
const spec = panelSpec(
	'payments',
	salesFigures({ orders }),
	{ money: String, number: String, quantity: String, percent: String },
	createTestT(),
	{ orders, names: { cashier: {}, register: {}, store: {} } }
);

function Scope({ children }: React.PropsWithChildren) {
	return (
		<ReportsDirectoriesProvider>
			<ReportsFilterScopeProvider>{children}</ReportsFilterScopeProvider>
		</ReportsDirectoriesProvider>
	);
}
function print(options: Partial<Parameters<typeof useReportPrint>[0]> = {}) {
	return renderHook(
		() =>
			useReportPrint({
				key: 'payments',
				title: 'Sales by payment method',
				spec,
				dataReady: true,
				needsRefunds: false,
				...options,
			}),
		{ wrapper: Scope }
	);
}
function printed() {
	const { useReceiptDocument } = jest.requireMock('../../receipt/use-receipt-document');
	return useReceiptDocument.mock.calls.at(-1)[0];
}

beforeEach(() => {
	mockState.store = { id: 9 };
	mockState.filters = { register: 'r', store: '9' };
	mockState.names = { r: 'Front' };
	mockStores.next([]);
	mockSales.set({ ready: true, laneProgress: null });
	mockRefunds.set({ ready: true, laneProgress: null });
	Object.assign(mockDoc, {
		templatesReady: true,
		templates: [{ id: 7 }],
		mismatch: null,
		resolvedPrinter: null,
		documentError: null,
	});
	mockDoc.print.mockReset().mockResolvedValue(true);
});

// The surfaces hand over a spec; the document, its scope and its register come from here.
it('builds the report document from the spec in the viewed scope', () => {
	const { result } = print({ scope: ['Priya', undefined, 'Completed & processing'] });
	expect(result.current.scopeLine).toBe('Today 2026-07-15 · Front');
	expect(result.current.label).toBe('Today 2026-07-15 · Front · Priya · Completed & processing');
	const options = printed();
	expect(options).toMatchObject({ autoPrintAllowed: false, templateType: 'report', storeId: 9 });
	expect(options.localReport.report).toMatchObject({
		key: 'payments',
		title: 'Sales by payment method',
		scope: {
			label: result.current.label,
			store_id: 9,
			register_id: 'r',
			register_name: 'Front',
			business_day: '2026-07-15',
		},
	});
	expect(options.localReport.report.columns.map((column: { key: string }) => column.key)).toEqual(
		spec.keys
	);
	expect(options.localReport.register).toEqual({ id: 'r', name: 'Front' });
	expect(Object.keys(options.localReport.report.generated_at).sort()).toEqual(
		Object.keys(fixture.report.generated_at).sort()
	);
});

// A single-store install's own scope is the sentinel too: it never prints "All stores".
it.each([
	['a named register', { register: 'r', store: '9' }, [], 'Front'],
	[
		'the bound register its name has not reached',
		{ register: 'bound', store: '9' },
		[],
		'Bound till',
	],
	['an unnamed register', { register: 'gone', store: '9' }, [], 'Unknown'],
	['every register', { store: '9' }, [], 'All registers'],
	[
		'a single-store sentinel',
		{ store: 'woocommerce-pos' },
		[{ id: 9, name: 'Shop' }],
		'All registers',
	],
	[
		'every store',
		{ store: 'woocommerce-pos' },
		[
			{ id: 9, name: 'Shop' },
			{ id: 10, name: 'Annex' },
		],
		'All stores',
	],
])('names %s', (_case, filters, stores, register) => {
	mockState.filters = filters;
	mockStores.next(stores);
	const { result } = print();
	expect(result.current.scopeLine).toBe(`Today 2026-07-15 · ${register}`);
	expect(printed().localReport.report.scope.register_name).toBe(register);
});

// Each gate keeps a blank, partial or misprinted report off paper and says why.
it.each([
	['the store', () => (mockState.store = undefined), {}, 'Waiting for the store'],
	['the data', () => {}, { dataReady: false }, 'Loading the report'],
	[
		'the orders lane',
		() => mockSales.set({ laneProgress: { loaded: 1, total: 2 } }),
		{},
		'Still loading orders for this range',
	],
	[
		'the refunds lane',
		() => mockRefunds.set({ laneProgress: { loaded: 1, total: 2 } }),
		{ needsRefunds: true },
		'Still loading refunds for this range',
	],
	[
		'nothing: a report that does not net refunds',
		() => mockRefunds.set({ laneProgress: { loaded: 1, total: 2 } }),
		{},
		null,
	],
	[
		'nothing: a lane whose read has not answered',
		() => mockSales.set({ ready: false, laneProgress: { loaded: 1, total: 2 } }),
		{},
		null,
	],
	['the templates', () => (mockDoc.templatesReady = false), {}, 'Loading templates'],
	[
		'a local template',
		() => (mockDoc.templates = []),
		{},
		'No template can print offline · manage templates in WP Admin',
	],
	[
		'a printer that can print the template',
		() => Object.assign(mockDoc, { mismatch: 'raw', resolvedPrinter: { id: 'p' } }),
		{},
		'The saved printer cannot print this template',
	],
	['nothing: no saved printer means the dialog', () => (mockDoc.mismatch = 'raw'), {}, null],
])('Print waits for %s', (_case, arrange, options, waiting) => {
	arrange();
	expect(print(options).result.current.waiting).toBe(waiting);
});

it('Print waits for the lane, then stops waiting when the range is complete', () => {
	mockSales.set({ laneProgress: { loaded: 1, total: 2 } });
	const { result } = print();
	expect(result.current.waiting).toBe('Still loading orders for this range');
	act(() => mockSales.set({ laneProgress: null }));
	expect(result.current.waiting).toBeNull();
});

// A failure must be visible and recover on the next press; a document error shows meanwhile.
it('shows false and thrown print failures, clears them on success, and shows a document error', async () => {
	mockDoc.print
		.mockResolvedValueOnce(false)
		.mockRejectedValueOnce(new Error('printer unavailable'));
	const { result } = print();
	expect(result.current.error).toBeNull();
	for (let attempt = 0; attempt < 2; attempt++) {
		await act(() => result.current.print());
		expect(result.current.error).toBe('Could not print. Try again.');
	}
	await act(() => result.current.print());
	await waitFor(() => expect(result.current.error).toBeNull());
	expect(mockDoc.print).toHaveBeenCalledTimes(3);
	mockDoc.documentError = new Error('document unavailable');
	expect(print().result.current.error).toBe('document unavailable');
});
