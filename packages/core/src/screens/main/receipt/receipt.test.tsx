/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Receipt } from './receipt';

const mockDownload = jest.fn();
const mockPrint = jest.fn();
const mockUseTemplateRenderer = jest.fn();
const mockUseDownloadReceiptPdf = jest.fn(() => ({
	download: mockDownload,
	isDownloading: false,
}));
let mockSuspenseValue: unknown;

const mockOrder = {
	id$: new BehaviorSubject(42),
	links$: new BehaviorSubject(undefined),
	billing: {},
};

const defaultTemplateRenderer = {
	templates: [{ id: 7, output_type: 'pdf', paper_width: null }],
	selectedTemplateId: 7,
	setSelectedTemplateId: jest.fn(),
	renderedHtml: '<html><body>Receipt</body></html>',
	receiptData: { id: 42 },
	receiptUrl: 'https://example.test/receipt/42',
	selectedTemplateEngine: 'html',
	selectedTemplateContent: '<html><body>Receipt</body></html>',
	isOffline: false,
	isSyncing: false,
};

type TestButtonProps = {
	children?: React.ReactNode;
	disabled?: boolean;
	loading?: boolean;
	onPress?: () => void;
	testID?: string;
};

function TestButton({ children, disabled, loading, onPress, testID }: TestButtonProps) {
	return (
		<button data-testid={testID} disabled={disabled || loading} onClick={onPress} type="button">
			{children}
		</button>
	);
}

jest.mock('@wcpos/components/modal', () => ({
	Modal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalAction: (props: TestButtonProps) => <TestButton {...props} />,
	ModalBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalClose: (props: TestButtonProps) => <TestButton {...props} />,
	ModalContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ModalTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
	DialogTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

type ContentSizeEvent = { nativeEvent: { contentSize: { width: number; height: number } } };
const capturedContentSizeHandlers: ((event: ContentSizeEvent) => void)[] = [];

jest.mock('@wcpos/components/webview', () => ({
	WebView: ({
		onContentSizeChange,
	}: {
		onContentSizeChange?: (event: ContentSizeEvent) => void;
	}) => {
		if (onContentSizeChange) capturedContentSizeHandlers.push(onContentSizeChange);
		return <iframe title="receipt-preview-frame" />;
	},
}));

jest.mock('./components/receipt-preview-viewport', () => ({
	ReceiptPreviewViewport: ({
		children,
		contentSize,
	}: {
		children?: React.ReactNode;
		contentSize?: { width: number; height: number } | null;
	}) => (
		<div data-testid="preview-viewport" data-content-size={JSON.stringify(contentSize ?? null)}>
			{children}
		</div>
	),
	getReceiptPreviewPaperWidth: () => 80,
}));

jest.mock('./email', () => ({
	EmailForm: () => <div>Email form</div>,
}));

jest.mock('./mismatch-badge', () => ({
	MismatchBadge: () => null,
}));

jest.mock('./printer-switcher', () => ({
	PrinterSwitcher: () => null,
}));

jest.mock('./syncing-badge', () => ({
	SyncingBadge: () => null,
}));

jest.mock('./template-switcher', () => ({
	TemplateSwitcher: () => null,
}));

jest.mock('./hooks/use-template-renderer', () => ({
	useTemplateRenderer: (...args: unknown[]) => mockUseTemplateRenderer(...args),
}));

jest.mock('./hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({
		allPrinters: [],
		resolvedPrinter: null,
		printerSelection: null,
		setPrinterSelection: jest.fn(),
		mismatchWarning: null,
		useSystemDialog: true,
	}),
}));

jest.mock('./hooks/use-download-receipt-pdf', () => ({
	useDownloadReceiptPdf: () => mockUseDownloadReceiptPdf(),
}));

jest.mock('../hooks/use-cloud-enqueue', () => ({
	createCloudEnqueueFactory: () => jest.fn(),
}));

jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({}),
}));

jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: { wc_price_decimals$: new BehaviorSubject(2) },
	}),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoPrintReceipt: false } }),
}));

jest.mock('../contexts/tax-rates/provider', () => {
	const ReactActual = jest.requireActual<typeof import('react')>('react');
	return { TaxRatesContext: ReactActual.createContext(null) };
});

jest.mock('../contexts/tax-rates/resolve-price-num-decimals', () => ({
	resolvePriceNumDecimals: () => 2,
}));

jest.mock('@wcpos/printer', () => ({
	usePrint: () => ({ print: mockPrint, isPrinting: false }),
}));

jest.mock('expo-router/react-navigation', () => ({
	useNavigationState: () => ({ routeNames: [] }),
}));

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => mockSuspenseValue,
	useObservableEagerState: (subject: BehaviorSubject<unknown>) => subject?.getValue?.(),
	useObservableState: (_source: unknown, initialValue: unknown) => initialValue,
}));

jest.mock('rxdb', () => ({
	isRxDocument: (value: unknown) => value === mockOrder,
}));

describe('Receipt preview content size', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		capturedContentSizeHandlers.length = 0;
		// next's Receipt guards on the suspense order before mounting the
		// preview — without a resolved order no WebView (and no handler) exists.
		mockSuspenseValue = mockOrder;
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
	});

	const viewportContentSize = () =>
		JSON.parse(screen.getByTestId('preview-viewport').getAttribute('data-content-size') ?? 'null');

	it('drops the previous template measurement on switch, even if it arrives late', () => {
		const { rerender } = render(<Receipt resource={{} as never} />);

		// Template 7's frame reports its size — the viewport tracks it.
		const template7Handler = capturedContentSizeHandlers.at(-1)!;
		act(() => template7Handler({ nativeEvent: { contentSize: { width: 398, height: 814 } } }));
		expect(viewportContentSize()).toEqual({ width: 398, height: 814 });

		// Switch to template 8 — the old measurement must not size the new preview.
		mockUseTemplateRenderer.mockReturnValue({
			...defaultTemplateRenderer,
			templates: [...defaultTemplateRenderer.templates, { id: 8, output_type: 'html' }],
			selectedTemplateId: 8,
		});
		rerender(<Receipt resource={{} as never} />);
		expect(viewportContentSize()).toBeNull();

		// A late measurement from template 7's unmounting frame must be ignored.
		act(() => template7Handler({ nativeEvent: { contentSize: { width: 398, height: 814 } } }));
		expect(viewportContentSize()).toBeNull();

		// Template 8's own frame measurement is applied.
		const template8Handler = capturedContentSizeHandlers.at(-1)!;
		act(() => template8Handler({ nativeEvent: { contentSize: { width: 794, height: 1123 } } }));
		expect(viewportContentSize()).toEqual({ width: 794, height: 1123 });

		act(() => template7Handler({ nativeEvent: { contentSize: { width: 398, height: 814 } } }));
		expect(viewportContentSize()).toEqual({ width: 794, height: 1123 });
	});
});

describe('Receipt PDF download action', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSuspenseValue = mockOrder;
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
		mockUseDownloadReceiptPdf.mockReturnValue({
			download: mockDownload,
			isDownloading: false,
		});
	});

	it('renders not-found before accessing document observables when the resource emits null', () => {
		mockSuspenseValue = null;

		render(<Receipt resource={{} as never} />);

		expect(screen.getByText('common.no_order_found')).toBeTruthy();
		expect(mockUseTemplateRenderer).not.toHaveBeenCalled();
	});

	it('downloads the selected server PDF receipt template', () => {
		render(<Receipt resource={{} as never} />);

		fireEvent.click(screen.getByTestId('receipt-download-pdf-button'));

		expect(mockDownload).toHaveBeenCalledWith({ orderId: 42, templateId: '7' });
	});

	it('disables PDF download while receipt data is syncing', () => {
		mockUseTemplateRenderer.mockReturnValue({
			...defaultTemplateRenderer,
			isSyncing: true,
		});

		render(<Receipt resource={{} as never} />);

		expect((screen.getByTestId('receipt-download-pdf-button') as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('disables PDF download when no template is selected', () => {
		mockUseTemplateRenderer.mockReturnValue({
			...defaultTemplateRenderer,
			templates: [],
			selectedTemplateId: undefined,
		});

		render(<Receipt resource={{} as never} />);

		expect((screen.getByTestId('receipt-download-pdf-button') as HTMLButtonElement).disabled).toBe(
			true
		);
	});
});
