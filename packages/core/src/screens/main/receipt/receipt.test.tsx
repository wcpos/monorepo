/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { withLedger } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';

import { Receipt } from './receipt';

const mockDownload = jest.fn();
const mockPrint = jest.fn();
const mockUseTemplateRenderer = jest.fn();
const mockUseUISettings = jest.fn(() => ({ uiSettings: { autoPrintReceipt: false } }));
const mockUseDownloadReceiptPdf = jest.fn(() => ({
	download: mockDownload,
	isDownloading: false,
}));
let mockSuspenseValue: unknown;

const mockOrder = {
	uuid: 'local-order-42',
	payload: { id: 42, links: undefined, billing: {}, status: 'completed', total: '149.00' },
};
let mockGateway: { settled_order_status?: string } | undefined;

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
	hasFinalData: true,
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

// The receipt document hook toasts when a cloud profile falls back to the system dialog for a report.
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({ title }: { title: string }) => <span>{title}</span>,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
	Dialog: ({ children, open = true }: React.PropsWithChildren<{ open?: boolean }>) =>
		open ? <div>{children}</div> : null,
	DialogAction: (props: TestButtonProps) => <TestButton {...props} />,
	DialogBody: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogClose: (props: TestButtonProps) => <TestButton {...props} />,
	DialogContent: ({ children, side }: React.PropsWithChildren<{ side: string }>) => (
		<div data-testid={side ? 'receipt-panel' : undefined} data-side={side}>
			{children}
		</div>
	),
	DialogFooter: jest.requireActual('../../../../jest/footer.test-utils').DialogFooter,
	DismissIsClose: jest.requireActual('../../../../jest/footer.test-utils').DismissIsClose,
	DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
	DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('../hooks/use-payment-gateways', () => ({
	usePaymentGateways: () => ({ gateway: mockGateway }),
}));

jest.mock('../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: [], byId: new Map() }),
}));

jest.mock('uniwind', () => ({ useCSSVariable: () => [] }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

type ContentSizeEvent = { nativeEvent: { contentSize: { width: number; height: number } } };
const capturedContentSizeHandlers: ((event: ContentSizeEvent) => void)[] = [];
const capturedLoadHandlers: (() => void)[] = [];

jest.mock('@wcpos/components/webview', () => ({
	WebView: ({
		onContentSizeChange,
		onLoad,
		testID,
		srcDoc,
	}: {
		onContentSizeChange?: (event: ContentSizeEvent) => void;
		onLoad?: () => void;
		testID?: string;
		srcDoc?: string;
	}) => {
		if (onContentSizeChange) capturedContentSizeHandlers.push(onContentSizeChange);
		if (onLoad) capturedLoadHandlers.push(onLoad);
		return <iframe title="receipt-preview-frame" data-testid={testID} srcDoc={srcDoc} />;
	},
}));

jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

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
	getReceiptPreviewPaperWidth: () => '80mm',
}));

jest.mock('./email', () => ({
	EmailForm: () => <div>Email form</div>,
}));

jest.mock('../hooks/use-sync-order', () => ({
	useSyncOrder: () => ({ sync: jest.fn(), loading: false, disabled: false }),
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

let mockAwaiting: boolean | null = false;
jest.mock('../pos/checkout/use-awaiting-store', () => ({ useAwaitsStore: () => mockAwaiting }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { price_num_decimals: 2 } }),
	useAppState: () => ({
		store: { wc_price_decimals$: new BehaviorSubject(2), price_num_decimals: 2 },
	}),
}));

jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => mockUseUISettings(),
}));

jest.mock('../contexts/tax-rates/provider', () => ({
	useTaxSettingsOptional: () => null,
}));

jest.mock('../contexts/tax-rates/resolve-price-num-decimals', () => ({
	resolvePriceNumDecimals: () => 2,
}));

jest.mock('@wcpos/printer', () => ({
	isOrderBasedCloudProfile: jest.requireActual('@wcpos/printer/transport/cloud-adapter')
		.isOrderBasedCloudProfile,
	usePrint: (options: { onBeforePrint?: () => void }) => ({
		print: async () => {
			options.onBeforePrint?.();
			await mockPrint();
			return true;
		},
		isPrinting: false,
	}),
}));

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => mockSuspenseValue,
	useObservableEagerState: (subject: BehaviorSubject<unknown>) => subject?.getValue?.(),
}));

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useRecordField: (record: typeof mockOrder, select: (record: typeof mockOrder) => unknown) =>
		select(record),
}));

describe('Receipt preview content size', () => {
	// Revert: remove the frame-specific testID so the viewport is mistaken for its iframe.
	it('addresses rendered receipt HTML through a distinct frame testID', () => {
		render(<Receipt resource={{} as never} />);
		expect(screen.getByTestId('receipt-preview-frame').getAttribute('srcdoc')).toBe(
			defaultTemplateRenderer.renderedHtml
		);
	});

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

	it('shows an unavailable message instead of a receipt frame when no preview source exists', () => {
		mockUseTemplateRenderer.mockReturnValue({
			...defaultTemplateRenderer,
			renderedHtml: null,
			receiptUrl: null,
		});

		render(<Receipt resource={{} as never} />);

		expect(screen.getByTestId('receipt-unavailable')).toBeTruthy();
		expect(screen.queryByTitle('receipt-preview-frame')).toBeNull();
		// The message sits on the themed panel, never on the viewport's white paper sheet.
		expect(screen.queryByTestId('preview-viewport')).toBeNull();
	});
});

describe('Receipt reprint host', () => {
	it('does not auto-print even when the setting is enabled', async () => {
		jest.clearAllMocks();
		mockSuspenseValue = mockOrder;
		mockUseUISettings.mockReturnValue({ uiSettings: { autoPrintReceipt: true } });
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
		render(<Receipt resource={{} as never} />);
		await act(async () => capturedLoadHandlers.at(-1)!());
		expect(mockPrint).not.toHaveBeenCalled();
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

	// ADR 0040 Decided 1 rule 1: until the journal answers, the paper's mark is unknown.
	it('holds the Print button until the journal has said whether the sale awaits the store', () => {
		mockAwaiting = null;
		render(<Receipt resource={{} as never} />);
		expect((screen.getByTestId('receipt-print-button') as HTMLButtonElement).disabled).toBe(true);
		mockAwaiting = false;
	});

	it('persists a print attempt before invoking the printer transport', async () => {
		let loggedBeforeTransport = false;
		mockPrint.mockImplementation(async () => {
			loggedBeforeTransport = jest.mocked(getLogger([]).info).mock.calls.length > 0;
		});
		render(<Receipt resource={{} as never} />);

		fireEvent.click(screen.getByTestId('receipt-print-button'));
		await act(async () => Promise.resolve());
		expect(loggedBeforeTransport).toBe(true);
		expect(screen.getByTestId('receipt-print-button').textContent).toBe('receipt.print_again');
		expect(getLogger([]).info).toHaveBeenCalledWith(
			'Receipt print attempted',
			expect.objectContaining({
				context: expect.objectContaining({
					event: 'receipt.print_attempted',
					orderId: 'local-order-42',
				}),
			})
		);
	});
});

describe('Receipt email action', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAwaiting = false;
		mockSuspenseValue = mockOrder;
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
	});

	const emailButton = () => screen.getByTestId('receipt-email-button') as HTMLButtonElement;

	it('offers Sync order when the order has no server id', () => {
		mockSuspenseValue = { ...mockOrder, payload: { billing: {} } };
		render(<Receipt resource={{} as never} />);

		expect(screen.getByTestId('receipt-sync-order-button').textContent).toBe('pos_cart.sync_order');
		expect(screen.getByTestId('receipt-close-button').textContent).toBe('Close');
	});

	it('does not offer Sync order when the order has a server id', () => {
		render(<Receipt resource={{} as never} />);

		expect(screen.queryByTestId('receipt-sync-order-button')).toBeNull();
	});

	it('disables Email when the order has no server id', () => {
		mockSuspenseValue = { ...mockOrder, payload: { billing: {} } };
		render(<Receipt resource={{} as never} />);

		expect(emailButton().disabled).toBe(true);
	});

	it('leaves replay in charge of an order without a server id awaiting the store', () => {
		mockSuspenseValue = { ...mockOrder, payload: { billing: {} } };
		mockAwaiting = true;
		render(<Receipt resource={{} as never} />);

		expect(screen.queryByTestId('receipt-sync-order-button')).toBeNull();
		expect(emailButton().disabled).toBe(false);
	});

	it('opens the email dialog when the store is reachable', () => {
		render(<Receipt resource={{} as never} />);

		expect(emailButton().disabled).toBe(false);
		expect(screen.queryByText('Email form')).toBeNull();
		fireEvent.click(emailButton());
		expect(screen.getByText('Email form')).toBeTruthy();
	});

	it('still opens the email dialog when offline — queuing IS the offline path (#165)', () => {
		// The 2026-03-06 stopgap (ba8729a77) rendered a disabled button here
		// instead of the dialog. That predates the durable queue: it left a
		// cashier finishing a sale offline with no way to send the receipt at
		// all, which is the exact scenario #165 exists to fix. EmailForm owns
		// the offline behaviour now — notice, label, and skip-the-round-trip
		// enqueue — so the entry point must reach it.
		mockUseTemplateRenderer.mockReturnValue({ ...defaultTemplateRenderer, isOffline: true });

		render(<Receipt resource={{} as never} />);

		expect(emailButton().disabled).toBe(false);
		expect(screen.queryByText('Email form')).toBeNull();
		fireEvent.click(emailButton());
		expect(screen.getByText('Email form')).toBeTruthy();
	});

	it('keeps the PDF download disabled offline — that one still needs the server', () => {
		mockUseTemplateRenderer.mockReturnValue({ ...defaultTemplateRenderer, isOffline: true });

		render(<Receipt resource={{} as never} />);

		expect((screen.getByTestId('receipt-download-pdf-button') as HTMLButtonElement).disabled).toBe(
			true
		);
	});
});

it('shows the refund title without email and keeps sale actions unchanged', () => {
	const translations = jest.requireMock('../../../contexts/translations');
	const { createTestT } = jest.requireActual('../../../../jest/translate');
	const translation = jest.spyOn(translations, 'useT').mockReturnValue(createTestT());
	mockSuspenseValue = mockOrder;
	mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
	try {
		const { rerender } = render(<Receipt resource={{} as never} document="refund:12" />);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Refund receipt');
		expect(screen.queryByTestId('receipt-email-button')).toBeNull();
		expect(screen.getByTestId('receipt-print-button').dataset.variant).toBe('default');
		expect(screen.getByTestId('receipt-print-button').textContent).toBe('Print receipt');
		fireEvent.click(screen.getByTestId('receipt-download-pdf-button'));
		expect(mockDownload).toHaveBeenLastCalledWith({
			orderId: 42,
			templateId: '7',
			document: 'refund:12',
		});
		rerender(<Receipt resource={{} as never} />);
		expect(screen.getByRole('heading', { level: 1, name: 'Receipt' }).textContent).toBe('Receipt');
		expect(screen.getByTestId('receipt-email-button')).toBeTruthy();
	} finally {
		translation.mockRestore();
	}
});

// Revert: ignore the explicit cart side or derive it from the removed POS provider.
it.each([null, mockOrder])(
	'uses the explicit panel side for a resolved or missing order (%p)',
	(order) => {
		mockSuspenseValue = order;
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
		const { rerender } = render(<Receipt {...{ resource: {} as never, side: 'left' as const }} />);
		expect(screen.getByTestId('receipt-panel').getAttribute('data-side')).toBe('left');
		rerender(<Receipt resource={{} as never} />);
		expect(screen.getByTestId('receipt-panel').getAttribute('data-side')).toBe('right');
	}
);

// A receipt handed over for an unpaid sale must say so; a paid one must not.
describe('Receipt of an unpaid order', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAwaiting = false;
		mockGateway = undefined;
		mockUseTemplateRenderer.mockReturnValue(defaultTemplateRenderer);
	});

	const withPayload = (payload: Record<string, unknown>) => {
		mockSuspenseValue = { ...mockOrder, payload: { ...mockOrder.payload, ...payload } };
	};
	const variant = (testID: string) => screen.getByTestId(testID).dataset.variant;

	it('an unsaved open order: Not paid mark, Save to store primary, Print outlined', () => {
		const translations = jest.requireMock('../../../contexts/translations');
		const { createTestT } = jest.requireActual('../../../../jest/translate');
		const translation = jest.spyOn(translations, 'useT').mockReturnValue(createTestT());
		withPayload({ id: undefined, status: 'pos-open', total: '149.00', refunds: [] });
		try {
			render(<Receipt resource={{} as never} />);
			expect(screen.getByTestId('receipt-not-paid').textContent).toBe('Not paid · 149.00 due');
			expect(variant('receipt-sync-order-button')).toBe('default');
			expect(variant('receipt-print-button')).toBe('outline');
		} finally {
			translation.mockRestore();
		}
	});

	it("a part-paid order's mark shows the balance still owed, not the total", () => {
		const translations = jest.requireMock('../../../contexts/translations');
		const { createTestT } = jest.requireActual('../../../../jest/translate');
		const translation = jest.spyOn(translations, 'useT').mockReturnValue(createTestT());
		withPayload({
			status: 'pos-partial',
			total: '100.00',
			meta_data: withLedger(
				[],
				[
					{
						id: 'captured-leg',
						source: 'app',
						order_id: 42,
						method_id: 'pos_cash',
						provider: null,
						kind: 'cash',
						capture_mode: 'manual',
						transport: null,
						recorded_offline: false,
						amount: '40.00',
						currency: 'USD',
						tendered: null,
						change: null,
						tip: null,
						status: 'captured',
						failure_reason: null,
						refunded_amount: '0.00',
						refunds: [],
						provider_refs: {},
						receipt: {},
						cashier_id: 1,
						store_id: null,
						created_at_gmt: '2026-01-01T00:00:00Z',
						captured_at_gmt: '2026-01-01T00:00:00Z',
						updated_at_gmt: '2026-01-01T00:00:00Z',
					},
				]
			),
		});
		try {
			render(<Receipt resource={{} as never} />);
			expect(screen.getByTestId('receipt-not-paid').textContent).toBe('Not paid · 60.00 due');
		} finally {
			translation.mockRestore();
		}
	});

	it('a fully refunded order carries no mark', () => {
		withPayload({
			status: 'refunded',
			total: '100.00',
			meta_data: withLedger(
				[],
				[
					{
						id: 'captured-leg',
						source: 'app',
						order_id: 42,
						method_id: 'pos_cash',
						provider: null,
						kind: 'cash',
						capture_mode: 'manual',
						transport: null,
						recorded_offline: false,
						amount: '100.00',
						currency: 'USD',
						tendered: null,
						change: null,
						tip: null,
						status: 'captured',
						failure_reason: null,
						refunded_amount: '100.00',
						refunds: [{ id: 12, amount: '100.00', status: 'succeeded', provider_ref: null }],
						provider_refs: {},
						receipt: {},
						cashier_id: 1,
						store_id: null,
						created_at_gmt: '2026-01-01T00:00:00Z',
						captured_at_gmt: '2026-01-01T00:00:00Z',
						updated_at_gmt: '2026-01-01T00:00:00Z',
					},
				]
			),
		});
		render(<Receipt resource={{} as never} />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
	});

	it('a zero balance carries no mark', () => {
		withPayload({
			status: 'pending',
			total: '50.00',
			meta_data: withLedger(
				[],
				[
					{
						id: 'captured-leg',
						source: 'app',
						order_id: 42,
						method_id: 'pos_cash',
						provider: null,
						kind: 'cash',
						capture_mode: 'manual',
						transport: null,
						recorded_offline: false,
						amount: '50.00',
						currency: 'USD',
						tendered: null,
						change: null,
						tip: null,
						status: 'captured',
						failure_reason: null,
						refunded_amount: '0.00',
						refunds: [],
						provider_refs: {},
						receipt: {},
						cashier_id: 1,
						store_id: null,
						created_at_gmt: '2026-01-01T00:00:00Z',
						captured_at_gmt: '2026-01-01T00:00:00Z',
						updated_at_gmt: '2026-01-01T00:00:00Z',
					},
				]
			),
		});
		render(<Receipt resource={{} as never} />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
	});

	it.each(['cancelled', 'failed', 'trash'])('a %s order carries no mark', (status) => {
		withPayload({ status, total: '100.00' });
		render(<Receipt resource={{} as never} />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
	});

	it('a saved unpaid order keeps Print primary and the mark', () => {
		withPayload({ status: 'pending' });
		render(<Receipt resource={{} as never} />);
		expect(variant('receipt-print-button')).toBe('default');
		expect(screen.getByTestId('receipt-not-paid')).toBeTruthy();
		expect(screen.queryByTestId('receipt-sync-order-button')).toBeNull();
	});

	it('a paid order: no mark, Print primary', () => {
		withPayload({ status: 'completed' });
		render(<Receipt resource={{} as never} />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
		expect(variant('receipt-print-button')).toBe('default');
	});

	it('a gateway that settles at pending counts as paid', () => {
		mockGateway = { settled_order_status: 'pending' };
		withPayload({ status: 'pending', payment_method: 'bacs' });
		render(<Receipt resource={{} as never} />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
	});

	it('a refund document carries no mark', () => {
		withPayload({ status: 'pos-open' });
		render(<Receipt resource={{} as never} document="refund:12" />);
		expect(screen.queryByTestId('receipt-not-paid')).toBeNull();
	});
});
