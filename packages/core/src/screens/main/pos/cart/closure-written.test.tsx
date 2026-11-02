/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { ClosureWritten } from './closure-written';
import { useClosureView } from '../../reports/closures/closure-panel';
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
let mockClosure = {
	id: 'c',
	session_id: 's',
	register_id: 'r',
	number: 1,
	server_number: null as number | null,
	counted: { cash: '463.30' },
	expected: { cash: '480.80' },
	variance: { cash: '-17.50' },
	unsynced_count: 2,
	print_count: 0,
	printed_at: null as string | null,
	opened_at: '2026-09-29T08:00:00Z',
	closed_at: '2026-09-29T10:00:00Z',
	breakdowns: {},
};
const mockContext = {
	i18n: {},
	timezone: 'UTC',
	locale: 'en',
	formatMoney: (n: string) => `£${Number(n).toFixed(2)}`,
};
const mockPrint = jest.fn(async () => true);
jest.mock('../../reports/closures/closure-panel', () => ({
	useClosureView: jest.fn((row: typeof mockClosure) => {
		const [error, setError] = React.useState('');
		const [printCount, setPrintCount] = React.useState(row.print_count);
		return {
			doc: {
				printedTo: null,
				printHeld: false,
				isPrinting: false,
				isSyncing: false,
				templates: [],
				selectedTemplateId: null,
				setSelectedTemplateId: jest.fn(),
				allPrinters: [],
				printerSelection: { type: 'auto' },
				setPrinterSelection: jest.fn(),
				resolvedPrinter: null,
				mismatch: null,
				previewProps: { renderedHtml: '', previewPaperWidth: 'a4' },
				receiptData: { closure: row },
				isOffline: true,
			},
			context: mockContext,
			settled: row,
			touched: new Set(),
			corrections: [],
			printCount,
			error,
			reprint: async () => {
				if (await mockPrint()) {
					setError('');
					setPrintCount((n) => n + 1);
				} else setError('Print failed');
			},
		};
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { name: 'UK Store' } }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useViewedStore: () => ({ name: 'UK Store' }),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ r: 'Front' }),
}));
jest.mock('../../../../services/register-session/use-closure-document-context', () => ({
	useClosureDocumentContext: () => mockContext,
}));
jest.mock('../../receipt/receipt-body', () => ({
	ReceiptBody: () => <div data-testid="z-preview" />,
}));
jest.mock('../../receipt/printer-switcher', () => ({ PrinterSwitcher: () => null }));
jest.mock('../../receipt/template-switcher', () => ({ TemplateSwitcher: () => null }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	ZoomIn: { duration: () => ({ easing: () => ({ reduceMotion: () => undefined }) }) },
	ReduceMotion: { System: 'system' },
	Keyframe: jest.fn(() => ({ duration: jest.fn() })),
	Easing: { bezier: jest.fn(), linear: jest.fn() },
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));

jest.mock('../../../../hooks/use-locale', () => ({ useLocale: () => ({ code: 'en' }) }));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	Button: ({
		children,
		onPress,
		testID,
		disabled,
		loading,
		className,
		size,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		disabled?: boolean;
		loading?: boolean;
		className?: string;
		size?: string;
	}) => (
		<button
			data-testid={testID}
			className={className}
			data-size={size}
			disabled={disabled || loading}
			onClick={onPress}
		>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
		secureTextEntry,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		secureTextEntry?: boolean;
	}) => (
		<input
			type={secureTextEntry ? 'password' : 'text'}
			data-testid={testID}
			value={value}
			onChange={(e) => onChangeText(e.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	...jest.requireActual('@wcpos/components/text'),
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ testID }: { testID?: string }) => <span data-testid={testID} />,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DismissIsClose: jest.requireActual('../../../../../jest/footer.test-utils').DismissIsClose,
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: jest.requireActual('react-native').View,
	DialogBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogHeader: jest.requireActual('react-native').View,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const count = () => ({ closure: mockClosure as never, counted: '0', expected: '0', blind: false });
it('shows the written heading and the three row figures; Done closes', () => {
	const onDone = jest.fn();
	render(<ClosureWritten count={count()} onDone={onDone} />);
	expect(screen.getByTestId('closure-written')).toBeTruthy();
	expect(screen.getByTestId('closure-title').textContent).toContain('Closure 1 written');
	expect(screen.getByTestId('closure-figure-counted').textContent).toBe('£463.30');
	expect(screen.getByTestId('closure-figure-expected').textContent).toBe('£480.80');
	expect(screen.getByTestId('closure-figure-result').textContent).toContain('−£17.50 short');
	expect(screen.queryByTestId('print-sheet-error')).toBeNull();
	fireEvent.click(screen.getByTestId('closure-done'));
	expect(onDone).toHaveBeenCalledTimes(1);
});
it('acknowledges an automatic print already recorded on the closure', () => {
	const previous = mockClosure;
	mockClosure = { ...mockClosure, printed_at: '2026-09-29T10:01:00Z', print_count: 1 };
	try {
		render(<ClosureWritten count={count()} onDone={jest.fn()} />);
		expect(screen.getByTestId('closure-printed').textContent).toContain('Printed on');
		expect(screen.getByTestId('closure-print').textContent).toBe('Print closure');
	} finally {
		mockClosure = previous;
	}
});
it('opens the print sheet, shows a failure there, then acknowledges a successful print', async () => {
	mockPrint.mockResolvedValueOnce(false);
	render(<ClosureWritten count={count()} onDone={jest.fn()} />);
	mockPrint.mockClear();
	expect(screen.queryByTestId('closure-written-print-sheet')).toBeNull();
	fireEvent.click(screen.getByTestId('closure-print'));
	expect(screen.getByTestId('closure-written-print-sheet')).toBeTruthy();
	expect(mockPrint).not.toHaveBeenCalled();
	expect(screen.getByTestId('print-sheet-print').textContent).toBe('Print closure');
	fireEvent.click(screen.getByTestId('print-sheet-print'));
	await waitFor(() =>
		expect(screen.getByTestId('print-sheet-error').textContent).toBe('Print failed')
	);
	expect(screen.getByTestId('closure-print').textContent).toBe('Print closure');
	fireEvent.click(screen.getByTestId('closure-print'));
	expect(screen.getByTestId('closure-written-print-sheet')).toBeTruthy();
	expect(screen.getByTestId('print-sheet-print').textContent).toBe('Print closure');
	fireEvent.click(screen.getByTestId('print-sheet-print'));
	await waitFor(() => expect(screen.getByTestId('closure-printed')).toBeTruthy());
	expect(screen.queryByTestId('print-sheet-error')).toBeNull();
	expect(mockPrint).toHaveBeenCalledTimes(2);
});
it('follows the server number after acknowledgement', () => {
	const previous = mockClosure;
	try {
		const view = render(<ClosureWritten count={count()} onDone={jest.fn()} />);
		mockClosure = { ...mockClosure, server_number: 4 };
		view.rerender(<ClosureWritten count={count()} onDone={jest.fn()} />);
		expect(screen.getByText('Closure 4 written')).toBeTruthy();
	} finally {
		mockClosure = previous;
	}
});
it('keeps blind figures and printing hidden, with a full-height Done', () => {
	render(<ClosureWritten count={{ ...count(), blind: true }} onDone={jest.fn()} />);
	expect(screen.getByTestId('closure-figure-counted')).toBeTruthy();
	expect(screen.queryByTestId('closure-figure-expected')).toBeNull();
	expect(screen.queryByTestId('closure-figure-result')).toBeNull();
	expect(screen.queryByTestId('closure-print')).toBeNull();
	fireEvent.click(screen.getByTestId('closure-paper'));
	expect(screen.queryByTestId('z-preview')).toBeNull();
	expect(screen.getByTestId('closure-done').getAttribute('data-size')).toBe('lg');
});
jest.mock('@wcpos/components/lib/overlay', () => ({
	useOverlay: () => ({ presentation: 'right' }),
	useOverlayPresentation: () => 'right',
}));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => false,
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it.each([
	[0, false],
	[1, true],
] as const)('uses print_count %s to select isReprint=%s', (print_count, isReprint) => {
	const previous = mockClosure;
	mockClosure = { ...mockClosure, print_count };
	jest.mocked(useClosureView).mockClear();
	try {
		render(<ClosureWritten count={count()} onDone={jest.fn()} />);
		expect(useClosureView).toHaveBeenCalledWith(mockClosure, { isReprint });
	} finally {
		mockClosure = previous;
	}
});
