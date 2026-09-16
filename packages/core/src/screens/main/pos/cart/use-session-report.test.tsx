/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useSessionReport } from './movement-sheet';

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' } }),
}));
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
let mockAutoOpen = false;
const mockOpenDrawer = jest.fn(async () => undefined);
const print = jest.fn(async () => undefined);
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
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		session: { id: 's', register_id: 'r' },
		expected: { cash: '155' },
		blind: false,
		binding: { registerName: 'Front' },
	}),
}));
beforeEach(() => {
	jest.clearAllMocks();
	mockAutoOpen = false;
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
				line_items: [expect.objectContaining({ total: '155' })],
			}),
		})
	);
});
it('prints the persisted closure and marks its time only after successful printing', async () => {
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
	expect(data).toMatchObject({ printed_at: at, print_count: 1 });
	expect(logger.info).not.toHaveBeenCalled();
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({
			document: 'closure:s',
			documentReady: false,
			localReport: expect.objectContaining({ footer: expect.stringContaining('Unsynced') }),
		})
	);
});

it('returns print success even when the local marker write fails', async () => {
	const incrementalModify = jest.fn().mockRejectedValue(new Error('disk write'));
	const closure = { id: 's', number: 1, print_count: 0, incrementalModify };
	const view = renderHook(() => useSessionReport(closure as never));
	await expect(view.result.current.print()).resolves.toEqual(expect.any(String));
	expect(incrementalModify).toHaveBeenCalledTimes(1);
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
			localReport: expect.objectContaining({ order_number: 'Z-report 4' }),
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
