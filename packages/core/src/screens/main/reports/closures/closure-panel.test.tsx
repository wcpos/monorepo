/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ClosureRow } from '@wcpos/database';
import { renderLogiclessTemplate } from '@wcpos/receipt-renderer/render-template';

import { ClosurePanel } from './closure-panel';

const mockPatch = jest.fn(async (_patch: { receipt_snapshot: string }) => undefined);
const mockCollection = { findOne: () => ({ exec: async () => ({ incrementalPatch: mockPatch }) }) };
let mockPhone = true;
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
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: { currency: 'USD', name: 'Shop' },
		site: { url: 'https://shop.test' },
	}),
}));
jest.mock('../../../../hooks/use-store-day', () => ({ useStoreDay: () => ({ timezone: 'UTC' }) }));
jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ code: 'en-US' }) }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({
		format: (n: number) =>
			new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n),
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
	DialogContent: ({ children, side }: { children: React.ReactNode; side: string }) => (
		<div data-testid={`dialog-${side}`}>{children}</div>
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
const mockDocument = jest.fn((options: { localReport: Record<string, unknown> }) => ({
	templates: [template],
	selectedTemplateId: 'core',
	setSelectedTemplateId: jest.fn(),
	isOffline: !mockRemote,
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
	ReceiptBody: ({ doc }: { doc: { previewProps: { renderedHtml: string } } }) => (
		<div
			data-testid="document"
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
	mockPhone = true;
	jest.clearAllMocks();
});
// Revert: use an order/report renderer, hide the sole template, enable unfinished mutations, or omit phone navigation.
it('opens a template-backed phone page with its single selector and disabled Stage C actions', () => {
	const close = jest.fn();
	render(<ClosurePanel row={row} onClose={close} />);
	expect(screen.getByTestId('document').textContent).toBe('4');
	expect(screen.getByTestId('receipt-template-select')).toBeTruthy();
	expect(screen.getByTestId('receipt-template-core').textContent).toBe('Default');
	expect(screen.queryByTestId('closure-settled')).toBeNull();
	expect((screen.getByTestId('closure-reprint') as HTMLButtonElement).disabled).toBe(true);
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
	await waitFor(() => expect(mockPatch).toHaveBeenCalled());
	const snapshot = mockPatch.mock.calls[0][0] as { receipt_snapshot: string };
	view.unmount();
	mockRemote = null;
	render(<ClosurePanel row={{ ...row, ...snapshot }} onClose={() => {}} />);
	expect(screen.getByTestId('document').textContent).toBe('9');
	expect(screen.getByTestId('closure-settled').textContent).toContain('$99.00 → $111.00');
});
