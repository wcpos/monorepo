/** @jest-environment jsdom */
import { of } from 'rxjs';
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useSessionReport } from '../../../../services/register-session/use-session-report';

const mockSite = { populate$: () => of([{ id: 8, display_name: 'Alex' }]) };
let mockOpenedBy = 8;

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: { name: 'Shop', currency: 'GBP' }, site: {} }),
	useStoreSession: () => ({
		site: mockSite,
		wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	}),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({ timezone: 'UTC' }),
	useViewedStore: () => undefined,
}));
jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ code: 'en-GB' }) }));
// Revert: route till reports through the report fallback instead of the shared closure envelope.
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
let mockAutoOpen = false;
const mockOpenDrawer = jest.fn(async () => undefined);
const print = jest.fn<Promise<boolean | undefined>, []>(async () => true);
const documentHook = jest.fn(() => ({ print }));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (...args: unknown[]) => documentHook(...(args as [])),
}));
jest.mock('../../receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: { autoOpenDrawer: mockAutoOpen } }),
}));
jest.mock('@wcpos/printer', () => ({
	PrinterService: class {
		openDrawer = mockOpenDrawer;
	},
}));
jest.mock('@wcpos/components/input', () => ({ Input: () => null }));
jest.mock('@wcpos/components/button', () => ({ Button: () => null }));
jest.mock('@wcpos/components/dialog', () => ({ Dialog: () => null }));
jest.mock('@wcpos/components/text', () => ({ Text: () => null }));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: number) => `£${value.toFixed(2)}` }),
}));
jest.mock('../../../../services/register-session/use-register-session-collections', () => ({
	useClosureCollection: () => undefined,
}));
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		session: { id: 's', register_id: 'r', opened_by: mockOpenedBy },
		expected: { cash: '155' },
		blind: false,
		binding: { registerName: 'Front' },
	}),
}));
beforeEach(() => {
	jest.clearAllMocks();
	mockAutoOpen = false;
	mockOpenedBy = 8;
});
it('routes X to the session document with the panel figures as offline data', async () => {
	const view = renderHook(() => useSessionReport());
	await view.result.current.print();
	expect(logger.info).toHaveBeenCalledWith(
		'Register X-report print dispatched',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: { type: 'register.x-report-printed', sessionId: 's', registerId: 'r' },
		})
	);
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			document: 'xreport:s',
			localReport: expect.objectContaining({
				closure: expect.objectContaining({
					expected: { cash: '155' },
					breakdowns: expect.objectContaining({
						labels: expect.objectContaining({ opened_by_name: 'Alex' }),
					}),
				}),
				i18n: expect.objectContaining({ x_report: 'X-report', closure: 'Closure' }),
				fiscal: expect.objectContaining({
					document_type: 'xreport',
					receipt_number: '',
					is_closure_document: true,
				}),
			}),
		})
	);
});
// Revert: count in the till wrapper as well as the document print path.
it('prints the persisted closure without duplicating the document print bookkeeping', async () => {
	let data = {
		id: 's',
		number: 1,
		counted: { cash: '150' },
		till_expected: { cash: '155' },
		variance: { cash: '-5' },
		unsynced_count: 2,
		sync_status: 'pending',
		print_count: 0,
		printed_at: null as string | null,
	};
	const closure = {
		getLatest: () => data,
		id: 's',
		incrementalModify: async (modify: (row: typeof data) => typeof data) => {
			data = modify(data);
		},
	};
	const view = renderHook(() => useSessionReport(closure as never));
	print.mockRejectedValueOnce(new Error('paper'));
	await expect(view.result.current.print()).rejects.toThrow('paper');
	expect(data.printed_at).toBeNull();
	const at = await view.result.current.print();
	expect(at).toEqual(expect.any(String));
	expect(data).toMatchObject({ printed_at: null, print_count: 0 });
	expect(logger.info).not.toHaveBeenCalled();
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			document: 'closure:s',
			documentReady: false,
			localReport: expect.objectContaining({
				closure: expect.objectContaining({ unsynced_count: 2 }),
			}),
		})
	);
});

it('does not write an additional local marker after the document path succeeds', async () => {
	const incrementalModify = jest.fn().mockRejectedValue(new Error('disk write'));
	const closure = { id: 's', number: 1, print_count: 0, incrementalModify };
	const view = renderHook(() => useSessionReport(closure as never));
	await expect(view.result.current.print()).resolves.toEqual(expect.any(String));
	expect(incrementalModify).not.toHaveBeenCalled();
});
it('loads a superseded closure from its authoritative server document', () => {
	const closure = {
		id: 's',
		server_closure_id: 'winner',
		number: 1,
		server_number: 4,
		sync_status: 'superseded',
	};
	renderHook(() => useSessionReport(closure as never));
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			document: 'closure:winner',
			documentReady: true,
			templateType: 'closure',
			localReport: expect.objectContaining({
				fiscal: expect.objectContaining({ receipt_number: '4' }),
			}),
		})
	);
});

it('logs the no-sale drawer kick only when dispatched successfully', async () => {
	const view = renderHook(() => useSessionReport());
	await view.result.current.openDrawer();
	expect(logger.info).not.toHaveBeenCalled();
	mockAutoOpen = true;
	view.rerender();
	mockOpenDrawer.mockRejectedValueOnce(new Error('printer'));
	await expect(view.result.current.openDrawer()).rejects.toThrow('printer');
	expect(logger.info).not.toHaveBeenCalled();
	await view.result.current.openDrawer();
	expect(logger.info).toHaveBeenCalledWith(
		'Register drawer kick dispatched',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: { type: 'register.drawer-opened', sessionId: 's', registerId: 'r' },
		})
	);
});

it('does not report an X-report when dispatch fails', async () => {
	const view = renderHook(() => useSessionReport());
	print.mockRejectedValueOnce(new Error('paper'));
	await expect(view.result.current.print()).rejects.toThrow('paper');
	expect(logger.info).not.toHaveBeenCalled();
});

it.each([false, undefined])(
	'does not log an X-report without explicit dispatch success (%s)',
	async (outcome) => {
		const view = renderHook(() => useSessionReport());
		print.mockResolvedValueOnce(outcome);
		await expect(view.result.current.print()).rejects.toThrow('Print was not dispatched');
		expect(logger.info).not.toHaveBeenCalled();
	}
);

it('does not mark a closure printed when the print layer silently fails', async () => {
	const incrementalModify = jest.fn();
	const closure = { id: 's', number: 1, print_count: 0, incrementalModify };
	const view = renderHook(() => useSessionReport(closure as never));
	print.mockResolvedValueOnce(undefined);
	await expect(view.result.current.print()).rejects.toThrow('Print was not dispatched');
	expect(incrementalModify).not.toHaveBeenCalled();
	expect(logger.info).not.toHaveBeenCalled();
});

// Revert: treat a loaded closure row without an RxDocument as an X-report.
it('uses the same closure print path for a loaded history row', async () => {
	const row = require('../../../../services/register-session/__fixtures__/closure-local-row.json');
	const view = renderHook(() => useSessionReport(null, true, row));
	await view.result.current.print();
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			document: `closure:${row.server_closure_id ?? row.id}`,
			isReprint: true,
			localReport: expect.objectContaining({
				fiscal: expect.objectContaining({ document_type: 'closure' }),
			}),
		})
	);
	expect(logger.info).not.toHaveBeenCalled();
});

// Revert: skip the credential directory, or lose the unknown opener's id.
it.each([
	[8, 'Alex'],
	[7, 'Pat'],
	[99, '99'],
])('uses the original opener label %s in the offline X-report', (openedBy, name) => {
	mockOpenedBy = Number(openedBy);
	renderHook(() => useSessionReport());
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			localReport: expect.objectContaining({
				closure: expect.objectContaining({
					breakdowns: expect.objectContaining({
						labels: expect.objectContaining({ opened_by_name: name }),
					}),
				}),
			}),
		})
	);
});
