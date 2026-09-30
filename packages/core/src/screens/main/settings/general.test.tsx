/** @jest-environment jsdom */
import * as React from 'react';

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { SavedFieldProvider } from './components/saved-mark';
import { GeneralSettings } from './general';

const mockLocalPatch = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();
const mockUseFormChangeHandler = jest.fn();
const mockLogError = jest.fn();
const site: { url?: string } = { url: 'https://example.test/' };
const store = {
	id: 1,
	name: 'UK Store',
	store_country: 'US',
	store_state: 'CA',
	store_city: 'San Francisco',
	store_postcode: '',
	locale: 'en_US',
	default_customer: 0,
	default_customer_is_cashier: false,
	currency: 'USD',
	currency_pos: 'left',
	price_thousand_sep: ',',
	price_decimal_sep: '.',
	price_num_decimals: 2,
	thousands_group_style: 'thousand',
	getLatest: () => store,
};

jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
	FadeOut: { duration: () => 'fade-out' },
	useReducedMotion: () => false,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ href, children }: React.PropsWithChildren<{ href: string }>) => (
		<a href={href}>{children}</a>
	),
}));
// Open renders its children; Cancel closes through the root, as the primitive does.
jest.mock('@wcpos/components/alert-dialog', () => {
	const ReactActual = jest.requireActual<typeof import('react')>('react');
	const Close = ReactActual.createContext<(open: boolean) => void>(() => {});
	function Pass({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({
			open,
			onOpenChange,
			children,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
			open ? (
				<Close.Provider value={onOpenChange}>
					<div role="alertdialog">{children}</div>
				</Close.Provider>
			) : null,
		AlertDialogContent: Pass,
		AlertDialogHeader: Pass,
		AlertDialogFooter: Pass,
		AlertDialogTitle: Pass,
		AlertDialogDescription: Pass,
		AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => {
			const close = ReactActual.useContext(Close);
			return (
				<button data-testid={testID} onClick={() => close(false)}>
					{children}
				</button>
			);
		},
		AlertDialogAction: ({
			children,
			testID,
			onPress,
		}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) => (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		),
	};
});
jest.mock('@wcpos/components/form', () => ({
	Form: ({ children }: React.PropsWithChildren) => children,
	FormCombobox: () => null,
	FormField: ({
		name,
		render,
	}: {
		name: string;
		render: (props: { field: Record<string, unknown> }) => React.ReactNode;
	}) => render({ field: { name, onChange: () => {} } }),
	FormInput: () => null,
	FormSelect: () => null,
	FormSwitch: () => null,
	useFormChangeHandler: (options: unknown) => mockUseFormChangeHandler(options),
}));
jest.mock('react-hook-form', () => ({
	useForm: () => ({ control: {}, getValues: jest.fn() }),
	useWatch: () => false,
	useFormContext: () => null,
}));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: jest.fn() }));
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => ({}) }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, selector: (value: T) => unknown) => selector(document),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: Error) => error.message,
	// Called at module load, before the spies initialise: reach them lazily.
	getLogger: () => ({
		error: (...args: unknown[]) => mockLogError(...args),
		warn: jest.fn(),
	}),
}));
jest.mock('@wcpos/hooks/use-http-client/is-expected-preflight-block', () => ({
	isExpectedPreflightBlock: () => false,
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => ({ store, site }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../utils/merge-stores', () => ({
	getServerOwnedStorePatch: () => ({ name: 'Server name' }),
}));
jest.mock('../components/currency-position-select', () => ({ CurrencyPositionSelect: () => null }));
jest.mock('../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../components/language-select', () => ({ LanguageSelect: () => null }));
jest.mock('../components/thousands-style-select', () => ({ ThousandsStyleSelect: () => null }));
jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));
jest.mock('../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => '' }),
}));
jest.mock('../hooks/use-default-customer', () => ({
	useDefaultCustomer: () => ({ defaultCustomerResource: {} }),
}));
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({ get: mockGet }) }));
jest.mock('./components/settings-section', () => ({
	SettingsSection: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('./components/settings-row', () => {
	const { SavedMark } = jest.requireActual('./components/saved-mark');
	return {
		SettingsRow: ({
			children,
			testID,
			name,
		}: React.PropsWithChildren<{ testID?: string; name?: string }>) => (
			<div data-testid={testID ?? (name && `row-${name}`)}>
				{name && <SavedMark name={name} />}
				{children}
			</div>
		),
	};
});

const renderGeneral = () =>
	render(
		<SavedFieldProvider>
			<GeneralSettings />
		</SavedFieldProvider>
	);

beforeEach(() => {
	jest.clearAllMocks();
	mockGet.mockResolvedValue({ data: {} });
});

describe('GeneralSettings store address', () => {
	it('shows the four address fields as mirrored values', () => {
		renderGeneral();
		expect(screen.getByTestId('settings-general-locked-country')).toHaveTextContent(
			'United States (US)'
		);
		expect(screen.getByTestId('settings-general-locked-state')).toHaveTextContent('California');
		expect(screen.getByTestId('settings-general-locked-city')).toHaveTextContent('San Francisco');
		// An empty value never reads blank.
		expect(screen.getByTestId('settings-general-locked-postcode')).toHaveTextContent('—');
		expect(screen.getByText('settings.tax_locked_note')).toBeInTheDocument();
	});

	it('links to the WooCommerce general settings only when the site has a url', () => {
		const { unmount } = renderGeneral();
		expect(screen.getByRole('link')).toHaveAttribute(
			'href',
			'https://example.test/wp-admin/admin.php?page=wc-settings'
		);
		expect(screen.getByRole('link')).toHaveTextContent('settings.store_locked_link');
		unmount();

		const url = site.url;
		delete site.url;
		try {
			renderGeneral();
			expect(screen.queryByRole('link')).toBeNull();
		} finally {
			site.url = url;
		}
	});

	it('never writes the locked keys from a form change, and marks what it wrote', async () => {
		renderGeneral();
		const { onChange } = mockUseFormChangeHandler.mock.calls[0][0];
		await act(() =>
			onChange({
				store_country: 'GB',
				store_state: 'LND',
				store_city: 'London',
				store_postcode: 'SW1',
				name: 'New name',
			})
		);

		expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { name: 'New name' } });
		expect(screen.getByTestId('row-name')).toContainElement(
			screen.getByTestId('settings-saved-name')
		);
		expect(screen.getByTestId('settings-saved-name')).toHaveTextContent('settings.saved');
		expect(screen.queryByTestId('settings-saved-locale')).toBeNull();
	});
});

describe('GeneralSettings Restore server settings', () => {
	it('asks first, and Cancel restores nothing', () => {
		renderGeneral();
		fireEvent.click(screen.getByTestId('settings-general-restore-server'));

		expect(screen.getByRole('alertdialog')).toHaveTextContent('settings.restore_confirm_title');
		expect(mockGet).not.toHaveBeenCalled();

		fireEvent.click(screen.getByTestId('settings-general-restore-cancel'));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('shows Restored at the row on success', async () => {
		renderGeneral();
		fireEvent.click(screen.getByTestId('settings-general-restore-server'));
		await act(async () => {
			fireEvent.click(screen.getByTestId('settings-general-restore-confirm'));
		});

		expect(mockGet).toHaveBeenCalledWith('stores/1');
		expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { name: 'Server name' } });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(screen.getByTestId('settings-saved-restore')).toHaveTextContent('settings.restored');
	});

	it('shows the failure at the row with Try again, still logging the error', async () => {
		mockGet.mockRejectedValueOnce(new Error('offline'));
		renderGeneral();
		fireEvent.click(screen.getByTestId('settings-general-restore-server'));
		await act(async () => {
			fireEvent.click(screen.getByTestId('settings-general-restore-confirm'));
		});

		expect(screen.getByText('settings.restore_failed')).toBeInTheDocument();
		expect(screen.queryByTestId('settings-saved-restore')).toBeNull();
		expect(mockLogError).toHaveBeenCalledWith(
			'Failed to restore server settings',
			expect.objectContaining({ context: { error: 'offline' } })
		);

		await act(async () => {
			fireEvent.click(screen.getByTestId('settings-general-restore-retry'));
		});
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(screen.queryByText('settings.restore_failed')).toBeNull();
		expect(screen.getByTestId('settings-saved-restore')).toBeInTheDocument();
	});
});
