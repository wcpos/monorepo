/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
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

jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials,
		site: { name: 'Test Site' },
		store: { localID: 'store-1', name: 'Test Store' },
		logout: jest.fn(),
		switchStore: jest.fn(),
	}),
}));

jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));

jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: {} }) }));
jest.mock('@wcpos/database', () => ({
	clearAllDB: jest.fn(),
	scheduleClearLocalDataOnNextLoad: jest.fn(),
}));
jest.mock('@wcpos/utils/unsent-changes', () => ({ forgetUnsentChanges: jest.fn() }));

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
	AlertDialogAction: passthrough,
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
	View: passthrough,
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
