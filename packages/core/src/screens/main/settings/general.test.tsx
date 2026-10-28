/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { GeneralSettings } from './general';

// The reset's confirm is its own suite; here the danger zone only needs its trigger.
jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../jest/property-row.test-utils')
);
jest.mock('../pos/cart/clear-local-data', () => ({
	ClearLocalData: ({ trigger }: { trigger: (onPress: () => void) => React.ReactNode }) =>
		trigger(jest.fn()),
}));
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-crypto', () => ({}));
const mockLocalPatch = jest.fn().mockResolvedValue({});
const mockGet = jest.fn().mockResolvedValue({ data: { store_city: 'London' } });
const mockChangeHandler = jest.fn();
const mockHttp = { get: mockGet };
const site: { url?: string } = { url: 'https://example.test' };
const store = {
	id: 1,
	name: 'Store',
	store_country: 'US',
	store_state: 'NY',
	store_city: 'London',
	store_postcode: '',
	getLatest: () => store,
};
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => ({ id: 0 }) }));
jest.mock('react-hook-form', () => ({
	useForm: () => ({ control: {}, getValues: () => 'GB' }),
	useWatch: () => false,
}));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: jest.fn() }));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/form', () => ({
	...jest.requireActual('@wcpos/components/form/saved-mark'),
	Form: ({ children }: React.PropsWithChildren) => children,
	FormField: () => null,
	useFormChangeHandler: (options: unknown) => mockChangeHandler(options),
}));
jest.mock('@wcpos/components/alert-dialog', () => {
	const Context = React.createContext((_open: boolean) => {});
	function Part({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({
			open,
			onOpenChange,
			children,
		}: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
			<Context.Provider value={onOpenChange}>
				{open ? <div role="alertdialog">{children}</div> : null}
			</Context.Provider>
		),
		AlertDialogContent: Part,
		AlertDialogHeader: Part,
		AlertDialogFooter: (props: import('@wcpos/components/alert-dialog').AlertDialogFooterProps) => {
			const close = React.useContext(Context);
			const Footer = jest.requireActual('../../../../jest/footer.test-utils').AlertDialogFooter;
			const cancel = typeof props.cancel === 'object' ? props.cancel : {};
			return (
				<Footer
					{...props}
					cancel={
						props.cancel === false
							? false
							: {
									...cancel,
									onPress: (event: Parameters<NonNullable<typeof cancel.onPress>>[0]) => {
										cancel.onPress?.(event);
										close(false);
									},
								}
					}
				/>
			);
		},
		AlertDialogTitle: Part,
		AlertDialogDescription: Part,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
		<a href={href}>{children}</a>
	),
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual<typeof import('react-native')>('react-native').View },
	FadeOut: { duration: jest.fn() },
	useReducedMotion: () => true,
}));
jest.mock('@wcpos/components/lib/motion', () => ({ BEAT: 220 }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// LockedRow imports the Switch for its boolean rows (uniwind is ESM under jest); General's rows are text.
jest.mock('@wcpos/components/switch', () => ({ Switch: () => null }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(document: T, select: (value: T) => unknown) => select(document),
}));
jest.mock('../../../contexts/app-state', () => ({ useStoreSession: () => ({ store, site }) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	patchStoreSettings: (document: unknown, data: unknown) => mockLocalPatch({ document, data }),
}));
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => mockHttp }));
jest.mock('../hooks/use-default-customer', () => ({
	useDefaultCustomer: () => ({ defaultCustomerResource: {} }),
}));
jest.mock('../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Guest' }),
}));
jest.mock('../components/form-errors', () => ({ FormErrors: () => null }));
jest.mock('../components/currency-position-select', () => ({ CurrencyPositionSelect: () => null }));
jest.mock('../components/currency-select', () => ({ CurrencySelect: () => null }));
jest.mock('../components/customer-select', () => ({ CustomerSelect: () => null }));
jest.mock('../components/language-select', () => ({ LanguageSelect: () => null }));
jest.mock('../components/thousands-style-select', () => ({ ThousandsStyleSelect: () => null }));

beforeEach(() => {
	jest.clearAllMocks();
	site.url = 'https://example.test';
});
it('renders the country display name and the raw address values, with an em dash for empty', () => {
	const { getByTestId } = render(<GeneralSettings />);
	// Each locked row reads key · value · where it is set · Open (rule 6).
	const row = (value: string) => `settings.store_base_${value}settings.set_in_woocommerceOpen`;
	expect(getByTestId('settings-general-locked-country').textContent).toBe(
		row('countryUnited States (US)')
	);
	expect(getByTestId('settings-general-locked-state').textContent).toBe(row('stateNew York'));
	expect(getByTestId('settings-general-locked-city').textContent).toBe(row('cityLondon'));
	expect(getByTestId('settings-general-locked-postcode').textContent).toBe(row('postcode—'));
});
it.each(['https://example.test', undefined, ''])(
	'links to WooCommerce only with a site URL (%s)',
	(url) => {
		site.url = url;
		const { queryAllByRole } = render(<GeneralSettings />);
		const hrefs = queryAllByRole('link').map((link) => link.getAttribute('href'));
		expect(hrefs).toEqual(
			url ? Array(4).fill('https://example.test/wp-admin/admin.php?page=wc-settings') : []
		);
	}
);
it('strips all four server-owned address keys while retaining editable changes', async () => {
	render(<GeneralSettings />);
	await act(() =>
		mockChangeHandler.mock.calls[0][0].onChange({
			name: 'Changed',
			store_country: 'US',
			store_state: 'NY',
			store_city: 'NYC',
			store_postcode: '10001',
		})
	);
	expect(mockLocalPatch).toHaveBeenCalledWith({ document: store, data: { name: 'Changed' } });
});
it('shows the failure line, not Restored, when the restore patch did not apply', async () => {
	// A server city that differs from the stored one makes a non-empty patch, so localPatch runs.
	mockGet.mockResolvedValueOnce({ data: { store_city: 'Leeds' } });
	mockLocalPatch.mockResolvedValueOnce(undefined);
	const { getByTestId, getByText, queryByTestId } = render(<GeneralSettings />);
	fireEvent.click(getByTestId('settings-general-restore-server'));
	await act(async () => fireEvent.click(getByTestId('settings-general-restore-confirm')));
	expect(getByText('settings.restore_failed')).toBeTruthy();
	expect(queryByTestId('saved-restore')).toBeNull();
});
it('asks before restoring, and cancelling does not fetch or patch', () => {
	const { getByTestId, queryByRole } = render(<GeneralSettings />);
	fireEvent.click(getByTestId('settings-general-restore-server'));
	expect(queryByRole('alertdialog')).not.toBeNull();
	expect(mockGet).not.toHaveBeenCalled();
	fireEvent.click(getByTestId('settings-general-restore-cancel'));
	expect(queryByRole('alertdialog')).toBeNull();
	expect(mockGet).not.toHaveBeenCalled();
	expect(mockLocalPatch).not.toHaveBeenCalled();
});
it('shows Restored after confirmation succeeds', async () => {
	const { getByTestId, queryByRole } = render(<GeneralSettings />);
	fireEvent.click(getByTestId('settings-general-restore-server'));
	await act(async () => fireEvent.click(getByTestId('settings-general-restore-confirm')));
	expect(mockGet).toHaveBeenCalledWith('stores/1');
	expect(getByTestId('saved-restore').textContent).toBe('settings.restored');
	expect(queryByRole('alertdialog')).toBeNull();
});
it('shows the failure line, with retry reopening confirmation rather than fetching', async () => {
	mockGet.mockRejectedValueOnce(new Error('Offline'));
	const { getByTestId, getByText, queryByRole } = render(<GeneralSettings />);
	fireEvent.click(getByTestId('settings-general-restore-server'));
	await act(async () => fireEvent.click(getByTestId('settings-general-restore-confirm')));
	expect(getByText('settings.restore_failed')).toBeTruthy();
	fireEvent.click(getByTestId('settings-general-restore-retry'));
	expect(queryByRole('alertdialog')).not.toBeNull();
	expect(mockGet).toHaveBeenCalledTimes(1);
});
