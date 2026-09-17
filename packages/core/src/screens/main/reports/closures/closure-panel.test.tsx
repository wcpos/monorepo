/** @jest-environment jsdom */
import * as React from 'react';

import { of } from 'rxjs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ClosureRow } from '@wcpos/database';
import { renderLogiclessTemplate } from '@wcpos/receipt-renderer/render-template';

import { ClosurePanel } from './closure-panel';

const mockPatch = jest.fn(async (_patch: { receipt_snapshot: string }) => undefined);
const mockCollection = {
	findOne: jest.fn((_query: unknown) => ({ exec: async () => ({ incrementalPatch: mockPatch }) })),
};
let mockPhone = true;
let mockLoadError: Error | null = null;
let mockOffline: boolean | undefined;
let mockRemote: Record<string, unknown> | null = null;
const template = {
	id: 'core',
	title: 'Default',
	offline_capable: true,
	engine: 'logicless',
	content: '<b>{{closure.number}}</b>',
};
jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockPhone ? 'sm' : 'lg' }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
const mockSession = {
	store: { id: 0, currency: 'USD', name: 'Shop', timezone: 'UTC' },
	site: { url: 'https://shop.test' },
	wpCredentials: {
		populate$: () => of([{ id: 2, currency: 'JPY', name: 'Tokyo', timezone: 'Asia/Tokyo' }]),
	},
};
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => mockSession }));
jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ code: 'en-US' }) }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: (options?: { currency?: string }) => ({
		format: (n: number) =>
			new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: options?.currency ?? 'USD',
			}).format(n),
	}),
}));
jest.mock('../../../../services/register-session/use-register-session-collections', () => ({
	useClosureCollection: () => mockCollection,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (v: T) => unknown) => (source ? select(source) : undefined),
}));
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		testID,
		onPress,
		children,
		disabled,
	}: {
		testID: string;
		onPress: () => void;
		children: React.ReactNode;
		disabled: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => children,
	DialogContent: ({
		children,
		side,
		portalHost,
		closeButtonProps,
		style,
	}: {
		children: React.ReactNode;
		side: string;
		portalHost?: string;
		style?: React.CSSProperties;
		closeButtonProps?: { testID?: string; onPress?: () => void };
	}) => (
		<div data-testid={`dialog-${side}`} data-host={portalHost} style={style}>
			{children}
			<button data-testid={closeButtonProps?.testID} onClick={closeButtonProps?.onPress} />
		</div>
	),
	DialogTitle: require('react-native').Text,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({ children }: { children: React.ReactNode }) => children,
	SelectTrigger: ({ children, testID }: { children: React.ReactNode; testID: string }) => (
		<button data-testid={testID}>{children}</button>
	),
	SelectValue: () => null,
	SelectContent: ({ children }: { children: React.ReactNode }) => children,
	SelectGroup: ({ children }: { children: React.ReactNode }) => children,
	SelectItem: ({ testID, label }: { testID: string; label: string }) => (
		<div data-testid={testID}>{label}</div>
	),
}));
const mockPrint = jest.fn(async () => true);
const mockRefetch = jest.fn();
const mockRecount = jest.fn();
jest.mock('./recount-sheet', () => ({
	RecountSheet: (props: { onSaved: () => void; onOpenChange: (v: boolean) => void }) => {
		mockRecount(props);
		return (
			<button
				data-testid="save-recount"
				onClick={() => {
					props.onSaved();
					props.onOpenChange(false);
				}}
			/>
		);
	},
}));
const mockDocument = jest.fn((options: { localReport: Record<string, unknown> }) => ({
	print: mockPrint,
	refetch: mockRefetch,
	isPrinting: false,
	templates: [template],
	selectedTemplateId: 'core',
	setSelectedTemplateId: jest.fn(),
	isOffline: mockOffline ?? !mockRemote,
	documentError: mockLoadError,
	receiptData: mockRemote ?? options.localReport,
	serverReceiptData: mockRemote,
	previewProps: {
		renderedHtml: renderLogiclessTemplate(template.content, mockRemote ?? options.localReport),
	},
}));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (options: { localReport: Record<string, unknown> }) => mockDocument(options),
}));
jest.mock('../../receipt/receipt-body', () => ({
	ReceiptBody: ({
		doc,
		fullWidth,
	}: {
		doc: { previewProps: { renderedHtml: string } };
		fullWidth?: boolean;
	}) => (
		<div
			data-testid="document"
			data-full-width={fullWidth}
			dangerouslySetInnerHTML={{ __html: doc.previewProps.renderedHtml }}
		/>
	),
}));
// Importing the pure renderer doesn't need these live hooks.
jest.mock('../../receipt/hooks/use-active-templates', () => ({ useActiveTemplates: jest.fn() }));
jest.mock('../../receipt/hooks/use-receipt-data', () => ({ useReceiptData: jest.fn() }));
jest.mock('../../../../services/register/use-register', () => ({ useRegister: jest.fn() }));
jest.mock('../../hooks/use-order-status-label', () => ({ useOrderStatusLabel: jest.fn() }));
jest.mock('../../contexts/tax-rates/provider', () => ({ useTaxSettingsOptional: jest.fn() }));
const row: ClosureRow = {
	id: 'c',
	session_id: 's',
	register_id: 'r',
	number: 4,
	opened_at: '2026-09-11T08:00:00Z',
	closed_at: '2026-09-11T17:00:00Z',
	till_expected: { cash: '100' },
	expected: { cash: '100' },
	counted: { cash: '99' },
	variance: { cash: '-1' },
	period_sales_total: '0',
	period_refunds_total: '0',
	perpetual_sales_total: '0',
	perpetual_refunds_total: '0',
	unsynced_count: 0,
	unsynced_total: '0',
	software_version: '',
	breakdowns: {},
	order_ids: [],
	movement_ids: [],
	print_count: 0,
	sync_status: 'synced',
	sync_attempts: 0,
};
beforeEach(() => {
	mockRemote = null;
	mockLoadError = null;
	mockOffline = undefined;
	mockPhone = true;
	jest.clearAllMocks();
});
// Revert: use an order/report renderer, hide the sole template, or omit phone navigation.
it('opens a template-backed phone page with its single selector and available reprint action', () => {
	const close = jest.fn();
	render(<ClosurePanel row={row} onClose={close} />);
	expect(screen.getByTestId('document').textContent).toBe('4');
	expect(screen.getByTestId('receipt-template-select')).toBeTruthy();
	expect(screen.getByTestId('receipt-template-core').textContent).toBe('Default');
	expect(screen.queryByTestId('closure-settled')).toBeNull();
	expect((screen.getByTestId('closure-reprint') as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByTestId('closure-recount') as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByTestId('closure-back'));
	expect(close).toHaveBeenCalledTimes(1);
	expect(mockDocument).toHaveBeenCalledWith(
		expect.objectContaining({ document: 'closure:c', templateType: 'closure' })
	);
});
// Revert: derive from the local baseline, mutate the printed document, omit correction metadata, or discard offline read history.
it('shows settled figures below the server document and retains its baseline/corrections offline', async () => {
	mockPhone = false;
	mockRemote = {
		closure: {
			...row,
			number: 9,
			expected: { cash: '110' },
			variance: { cash: '-11' },
			corrections: [
				{
					id: 1,
					type: 'recount',
					actor: { id: 1, name: 'Pat' },
					approver: { id: 2, name: 'Alex' },
					reason: 'Second count',
					created_at: '2026-09-11 18:00:00',
					figures: { counted: { cash: '111' } },
				},
			],
		},
		order: { currency: 'USD' },
		fiscal: { document_type: 'closure' },
	};
	const view = render(<ClosurePanel row={row} onClose={() => {}} />);
	expect(screen.getByTestId('dialog-right')).toBeTruthy();
	expect(screen.getByTestId('document').textContent).toBe('9');
	expect(screen.getByTestId('closure-settled').textContent).toContain('$99.00 → $111.00');
	expect(screen.getByTestId('closure-settled').textContent).toContain('-$11.00 → $1.00');
	expect(screen.getByTestId('closure-correction-1').textContent).toContain('Pat');
	expect(screen.getByTestId('closure-correction-1').textContent).toContain('Alex');
	expect(screen.getByTestId('closure-correction-1').textContent).toContain('Second count');
	fireEvent.click(screen.getByTestId('closure-recount'));
	expect(mockRecount).toHaveBeenLastCalledWith(
		expect.objectContaining({
			corrections: (mockRemote.closure as { corrections: unknown }).corrections,
		})
	);
	await waitFor(() => expect(mockPatch).toHaveBeenCalled());
	const snapshot = mockPatch.mock.calls[0][0] as { receipt_snapshot: string };
	view.unmount();
	mockRemote = null;
	render(<ClosurePanel row={{ ...row, ...snapshot }} onClose={() => {}} />);
	expect(screen.getByTestId('document').textContent).toBe('9');
	expect(screen.getByTestId('closure-settled').textContent).toContain('$99.00 → $111.00');
});

// Revert: leave Reprint disabled, suppress dispatch errors, or reprint automatically after refusal.
it('dispatches reprint once and shows a failed print without retry', async () => {
	mockPrint.mockRejectedValueOnce(new Error('refused'));
	render(<ClosurePanel row={row} onClose={() => {}} />);
	fireEvent.click(screen.getByTestId('closure-reprint'));
	await waitFor(() => expect(screen.getByTestId('closure-action-error')).toBeTruthy());
	expect(mockPrint).toHaveBeenCalledTimes(1);
});
// Revert: do not open recount or reload the corrected document after saving.
it('opens recount online and reloads the closure after success', () => {
	const refreshRow = jest.fn();
	mockRemote = { closure: row };
	render(<ClosurePanel row={row} onClose={() => {}} {...{ onRecountSaved: refreshRow }} />);
	fireEvent.click(screen.getByTestId('closure-recount'));
	expect(mockRecount).toHaveBeenCalledWith(expect.objectContaining({ row }));
	fireEvent.click(screen.getByTestId('save-recount'));
	expect(mockRefetch).toHaveBeenCalledTimes(1);
	expect(refreshRow).toHaveBeenCalled();
});

// Revert: use the unnamed portal, thumbnail preview, or omit the panel close action.
it('hosts the tablet panel in Reports with a full-width document and close action', () => {
	mockPhone = false;
	const close = jest.fn();
	render(<ClosurePanel row={row} onClose={close} />);
	expect(screen.getByTestId('dialog-right').getAttribute('data-host')).toBe('reports');
	expect(screen.getByTestId('document').getAttribute('data-full-width')).toBe('true');
	expect(screen.getByTestId('closure-close')).toBeTruthy();
	expect(screen.queryByTestId('closure-back')).toBeNull();
});

// Revert: restore the boxed Dialog content or let it position the panel from the centre.
it('bounds the tablet panel beneath the bar with a contained body and separate footer', () => {
	mockPhone = false;
	const previous = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
	Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
	try {
		render(<ClosurePanel row={row} onClose={() => {}} />);
		expect(screen.getByTestId('dialog-right').style.display).toBe('contents');
		const panel = screen.getByTestId('closure-panel');
		expect(panel.style.position).toBe('absolute');
		expect(panel.style.right).toBe('0px');
		expect(panel.style.top).toBe('0px');
		expect(panel.style.bottom).toBe('0px');
		expect(panel.style.left).toBe('auto');
		expect(panel.style.transform).toBe('none');
		expect(panel.style.width).toBe('480px');
		// The Reports host spans viewport minus rail; the panel cannot exceed that host.
		expect(panel.style.maxWidth).toBe('100%');
		const body = screen.getByTestId('closure-panel-body');
		expect(getComputedStyle(body).overflowX).toBe('hidden');
		expect(getComputedStyle(body.firstElementChild as HTMLElement).overflowX).toBe('hidden');
		const footer = screen.getByTestId('closure-panel-footer');
		expect(body.contains(footer)).toBe(false);
		expect(panel.contains(footer)).toBe(true);
		expect(footer.contains(screen.getByTestId('closure-reprint'))).toBe(true);
	} finally {
		Object.assign(window, previous);
	}
});

// Revert: call the document context without row.store_id.
it('formats settled amounts and correction timestamps in the closure store', () => {
	mockRemote = {
		closure: {
			...row,
			corrections: [
				{
					id: 1,
					type: 'recount',
					actor: { name: 'Pat' },
					approver: null,
					reason: 'Count',
					created_at: '2026-09-11 18:00:00',
					figures: { counted: { cash: '101' } },
				},
			],
		},
	};
	render(<ClosurePanel row={{ ...row, store_id: 2 }} onClose={() => {}} />);
	expect(screen.getByTestId('closure-settled').textContent).toContain('¥99 → ¥101');
	expect(screen.getByTestId('closure-correction-1').textContent).toContain('Sep 12, 2026, 3:00 AM');
});

// Revert: render a stale fallback as current after an online document GET failure, or omit Retry.
it('replaces the online fallback with a document error and a manual retry', () => {
	mockOffline = false;
	mockLoadError = new Error('document refused');
	const view = render(<ClosurePanel row={row} onClose={jest.fn()} />);
	expect(screen.queryByTestId('document')).toBeNull();
	expect(screen.getByTestId('closure-document-error').textContent).toContain(
		'Could not load closures'
	);
	fireEvent.click(screen.getByTestId('closure-document-retry'));
	expect(mockRefetch).toHaveBeenCalledTimes(1);
	mockLoadError = null;
	mockRemote = { closure: { ...row, number: 8 } };
	view.rerender(<ClosurePanel row={row} onClose={jest.fn()} />);
	expect(screen.queryByTestId('closure-document-error')).toBeNull();
	expect(screen.getByTestId('document').textContent).toBe('8');
});
// Revert: suppress the offline fallback with the online document error state.
it('keeps the offline document and warning rather than online Retry', () => {
	mockOffline = true;
	mockLoadError = new Error('disconnected');
	render(<ClosurePanel row={row} onClose={jest.fn()} />);
	expect(screen.getByTestId('document').textContent).toBe('4');
	expect(screen.queryByTestId('closure-document-retry')).toBeNull();
	expect(screen.getByText('Connect to recount')).toBeTruthy();
});

// Revert: find a server-listed closure only by local primary key, losing the offline print record.
it('resolves the local closure behind a server-listed drill-in', async () => {
	render(<ClosurePanel row={{ ...row, id: 'server' }} onClose={jest.fn()} />);
	const options = mockDocument.mock.calls.at(-1)?.[0] as unknown as {
		getLocalClosure: () => Promise<unknown>;
	};
	await options.getLocalClosure();
	expect(mockCollection.findOne).toHaveBeenCalledWith({
		selector: { $or: [{ id: 'server' }, { server_closure_id: 'server' }] },
	});
});

// Revert: coerce a null store to 0 for the document context or receipt/template hooks.
it('uses the current store context and receipt scope for a null-store closure', () => {
	const previous = mockSession.store;
	mockSession.store = { id: 1, currency: 'GBP', name: 'Current shop', timezone: 'Europe/London' };
	try {
		render(<ClosurePanel row={{ ...row, store_id: null }} onClose={jest.fn()} />);
		expect(mockDocument).toHaveBeenLastCalledWith(
			expect.objectContaining({
				storeId: undefined,
				localReport: expect.objectContaining({
					store: expect.objectContaining({ name: 'Current shop' }),
					order: expect.objectContaining({ currency: 'GBP' }),
				}),
			})
		);
	} finally {
		mockSession.store = previous;
	}
});
