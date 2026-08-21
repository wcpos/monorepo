/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { UserMenu } from './user-menu';

const displayName$ = new BehaviorSubject<string | undefined>('Ada Lovelace');
const avatarUrl$ = new BehaviorSubject<string | undefined>(undefined);
const stores$ = new BehaviorSubject<unknown[]>([]);

const wpCredentials = {
	uuid: 'creds-1',
	display_name$: displayName$,
	avatar_url$: avatarUrl$,
	stores$,
	populate$: () => new BehaviorSubject<unknown[]>([]),
};

jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		wpCredentials,
		site: { name: 'Test Site' },
		store: { localID: 'store-1', name: 'Test Store' },
		logout: jest.fn(),
		switchStore: jest.fn(),
	});
	return { useAppState, useStoreSession: useAppState };
});

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useQueryRuntime: () => ({ engine: {} }),
}));
jest.mock('@wcpos/database', () => ({
	clearAllDB: jest.fn().mockResolvedValue({ success: true, message: 'cleared' }),
	scheduleClearLocalDataOnNextLoad: jest.fn(),
}));
jest.mock('@wcpos/utils/unsent-changes', () => ({ forgetUnsentChanges: jest.fn() }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('../../../../utils/reload-app', () => ({ reloadApp: jest.fn() }));

jest.mock('@wcpos/utils/platform', () => ({
	Platform: { OS: 'web', isWeb: true, isNative: false, isElectron: false },
}));

jest.mock('../../hooks/use-image-attachment', () => ({
	useImageAttachment: () => ({ uri: undefined }),
}));

/**
 * The component tree below the trigger is irrelevant here — this test is about one string
 * reaching the header — so the component library is stubbed down to plain elements.
 */
function passthrough({ children }: { children?: React.ReactNode }) {
	return <div>{children}</div>;
}

jest.mock('@wcpos/components/avatar', () => ({
	Avatar: ({ fallback }: { fallback?: string }) => <span data-testid="avatar">{fallback}</span>,
	getInitials: (name?: string) =>
		(name ?? '')
			.split(' ')
			.map((part) => part[0] ?? '')
			.join(''),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: passthrough,
	ButtonText: ({ children }: { children?: React.ReactNode }) => (
		<span data-testid="trigger-label">{children}</span>
	),
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: passthrough,
	AlertDialogAction: ({
		children,
		onPress,
		testID,
	}: {
		children?: React.ReactNode;
		onPress?: () => void;
		testID?: string;
	}) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	AlertDialogCancel: passthrough,
	AlertDialogContent: passthrough,
	AlertDialogDescription: passthrough,
	AlertDialogFooter: passthrough,
	AlertDialogHeader: passthrough,
	AlertDialogTitle: passthrough,
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: passthrough,
	DropdownMenuContent: () => null,
	DropdownMenuItem: passthrough,
	DropdownMenuSeparator: () => null,
	DropdownMenuSub: passthrough,
	DropdownMenuSubContent: () => null,
	DropdownMenuSubTrigger: passthrough,
	DropdownMenuTrigger: passthrough,
}));
jest.mock('@wcpos/components/hstack', () => ({ HStack: passthrough }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: passthrough }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/portal', () => ({ Portal: passthrough }));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: passthrough },
	FadeIn: {},
}));
jest.mock('react-native', () => ({
	Linking: { openURL: jest.fn() },
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

/**
 * `display_name` was read straight off the credentials document while only `stores$` and
 * `avatar_url$` were subscribed, so a rename never reached the header or the avatar
 * initials until something else forced a re-render.
 */
describe('UserMenu display name', () => {
	beforeEach(() => {
		displayName$.next('Ada Lovelace');
	});

	it('renders the current display name', () => {
		render(<UserMenu />);

		expect(screen.getByTestId('trigger-label').textContent).toBe('Ada Lovelace');
		expect(screen.getByTestId('avatar').textContent).toBe('AL');
	});

	it('updates the header and the avatar initials when the name is changed', () => {
		render(<UserMenu />);

		act(() => {
			displayName$.next('Grace Hopper');
		});

		expect(screen.getByTestId('trigger-label').textContent).toBe('Grace Hopper');
		expect(screen.getByTestId('avatar').textContent).toBe('GH');
	});
});

/**
 * "Clear local data" must never destroy the databases under the mounted
 * provider tree without a guaranteed reload: every open RxDB handle (including
 * AppState.userDB) would keep pointing at removed storage. The confirmed reset
 * schedules a pre-hydration clear and reloads; a build that cannot restart
 * itself (production native, no expo-updates) freezes the register behind a
 * restart overlay with the data still intact.
 */
describe('UserMenu clear local data', () => {
	const { clearAllDB, scheduleClearLocalDataOnNextLoad } = jest.requireMock('@wcpos/database');
	const { reloadApp } = jest.requireMock('../../../../utils/reload-app');
	const { Toast } = jest.requireMock('@wcpos/components/toast');
	const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');

	const confirmReset = async () => {
		render(<UserMenu />);
		await act(async () => {
			fireEvent.click(screen.getByTestId('clear-all-local-data-confirm'));
		});
	};

	beforeEach(() => {
		jest.clearAllMocks();
		clearAllDB.mockResolvedValue({ success: true, message: 'cleared' });
		mockPlatform.OS = 'web';
		mockPlatform.isWeb = true;
		mockPlatform.isNative = false;
	});

	it('schedules the pre-hydration clear and reloads without touching the databases', async () => {
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(true);

		await confirmReset();

		expect(scheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
		expect(reloadApp).toHaveBeenCalled();
		expect(clearAllDB).not.toHaveBeenCalled();
		expect(Toast.show).not.toHaveBeenCalled();
		expect(screen.queryByTestId('clear-local-data-restart-overlay')).toBeNull();
	});

	it('freezes the register behind a restart overlay when the build cannot reload itself', async () => {
		mockPlatform.OS = 'ios';
		mockPlatform.isWeb = false;
		mockPlatform.isNative = true;
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(false);

		await confirmReset();

		expect(screen.getByTestId('clear-local-data-restart-overlay')).toBeTruthy();
		expect(clearAllDB).not.toHaveBeenCalled();
	});

	it('refuses a direct clear on native when the flag cannot be scheduled', async () => {
		mockPlatform.OS = 'ios';
		mockPlatform.isWeb = false;
		mockPlatform.isNative = true;
		scheduleClearLocalDataOnNextLoad.mockReturnValue(false);

		await confirmReset();

		expect(clearAllDB).not.toHaveBeenCalled();
		expect(reloadApp).not.toHaveBeenCalled();
		expect(Toast.show).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'error', title: 'common.clear_all_local_data_failed' })
		);
	});

	it('falls back to a direct clear plus reload on web when the flag cannot be scheduled', async () => {
		scheduleClearLocalDataOnNextLoad.mockReturnValue(false);
		reloadApp.mockReturnValue(true);

		await confirmReset();

		expect(clearAllDB).toHaveBeenCalled();
		expect(reloadApp).toHaveBeenCalled();
	});
});
