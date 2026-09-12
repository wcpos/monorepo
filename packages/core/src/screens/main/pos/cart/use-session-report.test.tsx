/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useSessionReport } from './movement-sheet';

jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
const print = jest.fn(async () => undefined);
const documentHook = jest.fn(() => ({ print }));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (...args: unknown[]) => documentHook(...(args as [])),
}));
jest.mock('../../receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: null }),
}));
jest.mock('@wcpos/printer', () => ({ PrinterService: class {} }));
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
		session: { id: 's' },
		expected: { cash: '155' },
		blind: false,
		binding: { registerName: 'Front' },
	}),
}));
it('routes X to the session document with the panel figures as offline data', async () => {
	const view = renderHook(() => useSessionReport());
	await view.result.current.print();
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
