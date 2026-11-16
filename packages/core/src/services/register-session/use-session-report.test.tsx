/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { NEVER } from 'rxjs';

import { buildXReportDocument, type ClosureContext } from './closure-document';
import { useSessionReport } from './use-session-report';

const mockAppState = {
	site: {},
	storeDB: {},
	wpCredentials: { id: 7, display_name: 'Alex' },
};
jest.mock('../../contexts/app-state', () => ({
	useAppState: () => mockAppState,
	useStoreSession: () => mockAppState,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(row: T, select: (value: T) => unknown) => (row ? select(row) : undefined),
}));
// The cashier list stays unanswered: its arrival is an input change of its own.
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeSiteCredentials: () => NEVER,
}));
jest.mock('@wcpos/query/register-session', () => ({
	readClosure: jest.fn(),
	recordRegisterFact: jest.fn(),
}));
jest.mock('@wcpos/printer', () => ({ PrinterService: jest.fn() }));
// The document context, one object until an input changes. In the app the React Compiler keeps
// the real hook's result stable this way; under ts-jest (no compiler) it is new on every render.
const contextFor = (locale: string): ClosureContext => ({
	store: { name: 'Shop', address_lines: [] },
	currency: 'USD',
	timezone: 'UTC',
	locale,
	printedAt: '2026-09-11T10:00:30.000Z',
	formatMoney: (value) => (value === '' ? '' : `$${Number(value).toFixed(2)}`),
	i18n: {},
});
let mockContext = contextFor('en-US');
jest.mock('./use-closure-document-context', () => ({
	useClosureDocumentContext: () => mockContext,
}));
// The register's drawer read: one emission is one set of objects, whatever re-renders.
const mockDrawer: { session: object; expected: object; movements: object[] } = {
	session: {
		id: 's1',
		register_id: 'r1',
		store_id: 1,
		opened_by: 7,
		opened_at_gmt: '2026-09-11T08:00:00Z',
	},
	expected: { cash: '100.0000' },
	movements: [],
};
jest.mock('./use-register-session', () => ({
	useRegisterSession: () => ({
		...mockDrawer,
		blind: false,
		binding: { registerName: 'Front' },
		salesCount: 3,
	}),
}));
jest.mock('../../screens/main/receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: null }),
}));
jest.mock('../../screens/main/receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ print: jest.fn() }),
}));
jest.mock('./closure-document', () => {
	const actual = jest.requireActual('./closure-document');
	return { ...actual, buildXReportDocument: jest.fn(actual.buildXReportDocument) };
});
const build = jest.mocked(buildXReportDocument);

beforeEach(() => {
	build.mockClear();
	mockContext = contextFor('en-US');
	mockDrawer.movements = [];
});

// Revert: build the X report on every render again (drop the useMemo in use-session-report.ts).
it('builds the X report once across re-renders with unchanged inputs', () => {
	const { rerender } = renderHook(() => useSessionReport());
	for (let i = 0; i < 10; i++) rerender();
	expect(build).toHaveBeenCalledTimes(1);
});

it('rebuilds the X report for a new movement', () => {
	const { rerender } = renderHook(() => useSessionReport());
	mockDrawer.movements = [
		{ id: 'm1', type: 'paid_in', amount: '5.0000', created_at_gmt: '2026-09-11 09:00:00' },
	];
	rerender();
	rerender();
	expect(build).toHaveBeenCalledTimes(2);
	expect(build.mock.calls[1][1].breakdowns?.movements).toBe(mockDrawer.movements);
});

it('rebuilds the X report for a locale change', () => {
	const { rerender } = renderHook(() => useSessionReport());
	mockContext = contextFor('fr-FR');
	rerender();
	rerender();
	expect(build).toHaveBeenCalledTimes(2);
	expect(build.mock.calls[1][1].locale).toBe('fr-FR');
});
