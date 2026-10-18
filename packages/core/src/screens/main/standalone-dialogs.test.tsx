/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';
import { Pressable, type ViewProps } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { ClosureRow } from '@wcpos/database';

import { ReceiptActions } from './receipt/receipt-actions';
import { Version } from './components/drawer-content/version';
import { ClosurePanel } from './reports/closures/closure-panel';
import { DetailPanel } from './reports/panels/panel';
import { PrinterDialogLayout } from './settings/printer/dialog/printer-dialog-layout';

import type { PrinterFormValues } from './settings/printer/schema';

let mockPhone = false;
function mockView({ children, className, testID }: ViewProps) {
	return (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	);
}
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: mockView,
	ScrollView: mockView,
}));
jest.mock('react-native-reanimated', () => {
	const animation = { duration: () => animation, easing: () => animation };
	return {
		__esModule: true,
		default: { View: mockView },
		Easing: { bezier: () => 'ease' },
		...Object.fromEntries(
			[
				'FadeIn',
				'FadeOut',
				'SlideInDown',
				'SlideInLeft',
				'SlideInRight',
				'SlideOutDown',
				'SlideOutLeft',
				'SlideOutRight',
			].map((key) => [key, animation])
		),
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@wcpos/components/keyboard-controller', () => ({ KeyboardAvoidingView: mockView }));
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));
// Exercise the real dialog, shell and parts; substitute native primitives and unrelated form controls.
jest.mock('@rn-primitives/dialog', () => {
	const Context = React.createContext({ open: false, onOpenChange: (_open: boolean) => {} });
	return {
		Root: ({
			children,
			open: controlledOpen,
			onOpenChange,
		}: React.PropsWithChildren<{ open?: boolean; onOpenChange?: (open: boolean) => void }>) => {
			const [localOpen, setOpen] = React.useState(false);
			return (
				<Context.Provider
					value={{
						open: controlledOpen ?? localOpen,
						onOpenChange: (next) => {
							setOpen(next);
							onOpenChange?.(next);
						},
					}}
				>
					{children}
				</Context.Provider>
			);
		},
		Portal: mockView,
		Trigger: ({ children }: React.PropsWithChildren) => {
			const { onOpenChange } = React.useContext(Context);
			return React.isValidElement<{ onPress?: () => void }>(children)
				? React.cloneElement(children, { onPress: () => onOpenChange(true) })
				: null;
		},
		Content: ({ children, className, testID }: ViewProps) => {
			const { open } = React.useContext(Context);
			return open ? (
				<div role="dialog" className={className} data-testid={testID}>
					{children}
				</div>
			) : null;
		},
		Overlay: mockView,
		Title: mockView,
		Close: ({ children }: React.PropsWithChildren) => {
			const { onOpenChange } = React.useContext(Context);
			return React.isValidElement<{ onPress?: () => void }>(children)
				? React.cloneElement(children, { onPress: () => onOpenChange(false) })
				: null;
		},
		useRootContext: () => React.useContext(Context),
	};
});
jest.mock('@rn-primitives/slot', () => ({
	Slot: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
		React.isValidElement(children) ? React.cloneElement(children, props) : null,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		onPress,
		testID,
		accessibilityLabel: label,
	}: {
		onPress?: () => void;
		testID?: string;
		accessibilityLabel?: string;
	}) => <button aria-label={label} data-testid={testID} onClick={onPress} />,
}));
jest.mock('@wcpos/components/button', () => ({ Button: mockView }));
jest.mock('@wcpos/components/text', () => ({
	Text: mockView,
	TextClassContext: React.createContext(''),
}));
jest.mock('@wcpos/components/form', () => ({ Form: mockView, FormField: () => null }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: mockView }));
jest.mock('./settings/printer/dialog/printer-toggle-group', () => ({
	PrinterToggleGroup: () => null,
}));
jest.mock('./components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/core/contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));
jest.mock('@wcpos/core/hooks/use-app-info', () => ({
	useAppInfo: () => ({ appVersion: 'test-build', platformVersion: 'test-build', platform: 'web' }),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('./receipt/email', () => ({ EmailForm: () => <span>Email form</span> }));
// The reports panels keep their real dialog wiring; their data hooks and bodies are stubs.
jest.mock('@wcpos/components/breadcrumb', () => ({ Breadcrumb: () => null }));
jest.mock('@wcpos/database/collections/schemas/closures', () => ({ CLOSURE_DOCUMENT_LIMIT: 1e6 }));
jest.mock('../../contexts/app-state', () => {
	// One session object: a new `site` per render resubscribes the directory forever.
	const session = { site: { populate$: () => jest.requireActual('rxjs').of([]) } };
	return { useStoreSession: () => session };
});
jest.mock('../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: () => null }),
}));
jest.mock('../../hooks/use-store-day', () => ({
	useStoreDay: () => ({ presets: () => [] }),
	zoneOptions: () => undefined,
}));
jest.mock('../../query', () => ({
	useQueryHandleFields: () => ({ ready: false }),
	useQueryState: () => ({ filters: {} }),
}));
jest.mock('../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({}),
}));
jest.mock('../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({}),
	useRegisterNamesReady: () => true,
}));
jest.mock('../../services/register-session/closure-document', () => ({
	buildClosureDocument: () => null,
}));
jest.mock('../../services/register-session/settled-figures', () => ({
	deriveSettled: () => ({ settled: {}, touched: new Set() }),
}));
jest.mock('../../services/register-session/use-closure-document-context', () => ({
	useClosureDocumentContext: () => ({}),
}));
jest.mock('./hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('./receipt/use-receipt-document', () => ({
	useReceiptDocument: () => ({ templates: [] }),
}));
jest.mock('./receipt/receipt-body', () => ({ ReceiptBody: () => null }));
jest.mock('./receipt/template-switcher', () => ({ TemplateSwitcher: () => null }));
jest.mock('./receipt/printer-switcher', () => ({ PrinterSwitcher: () => null }));
jest.mock('./reports/closures/recount-sheet', () => ({ RecountSheet: () => null }));
jest.mock('./reports/closures/save-or-share-csv', () => ({ saveOrShareCsv: jest.fn() }));
jest.mock('./reports/cards/aggregate', () =>
	Object.fromEntries(
		[
			'cashiers',
			'categories',
			'channels',
			'registers',
			'taxesByRate',
			'tenders',
			'topProducts',
		].map((name) => [name, () => null])
	)
);
jest.mock('./reports/cards/use-local-products', () => ({ useLocalProducts: () => [] }));
jest.mock('./reports/cards/use-local-categories', () => ({ useLocalCategories: () => [] }));
jest.mock('./reports/margin', () => ({
	brands: () => null,
	cogsEnabled: () => false,
	lineCost: () => null,
}));
jest.mock('./reports/date-button', () => ({ periodLabel: () => ({ text: '' }) }));
jest.mock('./reports/use-report-formats', () => ({
	useReportFormats: () => ({ quantity: String, money: String }),
}));
jest.mock('./reports/panels/export-csv', () => ({ panelCsv: () => null }));
jest.mock('./reports/panels/report-rows', () => ({ ReportRows: () => null }));
jest.mock('./reports/panels/orders-panel', () => ({ OrdersPanel: () => null }));
jest.mock('./reports/panels/document', () => ({ buildReportDocument: () => null }));
jest.mock('./reports/panels/specs', () => ({
	panelSpec: () => ({ head: [], keys: [], types: [], align: [] }),
}));
jest.mock('./reports/context', () => ({
	useIncludedStatus: () => () => true,
	useReportsData: () => ({ allOrders: [], selectedOrders: [], totals: {}, periodRefunds: [] }),
	useReportsHandles: () => ({}),
	useReportsPeriod: () => ({
		dateRange: { start: new Date(0), end: new Date(0) },
		storeId: 1,
		timezone: 'UTC',
	}),
	useReportsScope: () => ({ detail: 'payments', setDetail: jest.fn() }),
	useReportsSelection: () => ({ unselectedRowIds: {} }),
}));

function Printer({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
	const form = useForm<PrinterFormValues>();
	return (
		<PrinterDialogLayout
			form={form}
			open
			onOpenChange={onOpenChange}
			isEditing
			connectionSection={<span>Connection</span>}
			advancedSettings={<span>Options</span>}
			footer={<span>Save printer</span>}
		/>
	);
}

// Reverting the layout to the old dialog leaves a narrow side panel on a phone.
it.each([false, true])('printer keeps its wide desktop panel or phone page (phone=%s)', (phone) => {
	mockPhone = phone;
	const close = jest.fn();
	render(<Printer onOpenChange={close} />);
	expect(screen.getByRole('dialog')).toHaveClass(phone ? 'w-full' : 'w-200');
	expect(screen.getByText('Save printer').parentElement).toHaveClass('border-t');
	fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
	expect(close).toHaveBeenCalledWith(false);
});

// Reverting About loses the v2 close selector; making it a side panel changes its phone presentation.
it.each([false, true])('About opens centred and small, then closes (phone=%s)', (phone) => {
	mockPhone = phone;
	render(<Version />);
	expect(screen.queryByRole('dialog')).toBeNull();
	fireEvent.click(screen.getByText('v test-build'));
	expect(screen.getByRole('dialog')).toHaveClass('w-80', 'rounded-lg');
	expect(screen.getByText('common.about_wcpos')).toBeInTheDocument();
	fireEvent.click(screen.getByTestId('dialog-close'));
	expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([false, true])(
	'receipt email opens centred and closes independently (phone=%s)',
	(phone) => {
		mockPhone = phone;
		type Props = React.ComponentProps<typeof ReceiptActions>;
		const doc = {
			document: null,
			canDownloadPdf: false,
			isDownloadingPdf: false,
			isPrinting: false,
			isSyncing: false,
			downloadReceiptPdf: jest.fn(),
			print: jest.fn(async () => true),
			printedTo: null,
		} as unknown as Props['doc'];
		render(
			<ReceiptActions
				doc={doc}
				order={{} as Props['order']}
				buttonComponent={({ children, ...props }) => (
					<Pressable {...props}>
						{(state) => <span>{typeof children === 'function' ? children(state) : children}</span>}
					</Pressable>
				)}
			/>
		);
		expect(screen.queryByRole('dialog')).toBeNull();
		fireEvent.click(screen.getByTestId('receipt-email-button'));
		expect(screen.getByRole('dialog')).toHaveClass('w-96', 'rounded-lg');
		expect(screen.getByText('Email form')).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('dialog-close'));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByTestId('receipt-print-button')).toBeInTheDocument();
	}
);

// Reverting either reports panel to `accessibilityLabel` lets the dialog's English default win.
it('reports panels name their close buttons in the store language', () => {
	mockPhone = false;
	render(
		<>
			<ClosurePanel row={{ id: 'c', sync_status: 'synced' } as ClosureRow} onClose={jest.fn()} />
			<DetailPanel />
		</>
	);
	expect(screen.getByTestId('closure-close')).toHaveAttribute('aria-label', 'common.close');
	expect(screen.getByTestId('detail-panel-close')).toHaveAttribute('aria-label', 'common.close');
});
