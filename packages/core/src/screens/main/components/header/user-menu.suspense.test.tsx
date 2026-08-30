/**
 * @jest-environment jsdom
 *
 * The header's store switcher carried the same two defects the Orders filter bar did (#1707):
 * the stores `ObservableResource` was built in a `useMemo` during render, and `StoreSubMenu`
 * read it with `useObservableSuspense` with no `Suspense` of its own.
 *
 * `ObservableResource` subscribes in its constructor and `read()` throws a FRESH promise until
 * the first value lands. A component that suspends before its subtree has ever committed makes
 * React unwind to the boundary and throw the work-in-progress fibers away, `useMemo` included,
 * so the retry builds another resource that suspends for exactly the reason its predecessor
 * did — a loop, not a load. And with no boundary of its own the suspension escaped the header
 * entirely, to expo-router's per-route `Suspense`, whose production fallback is `null`.
 *
 * Separate from `user-menu.test.tsx` because that file stubs `@wcpos/components/suspense` to a
 * pass-through and renders `DropdownMenuSubContent` as `null`, so nothing in it can suspend.
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject, Observable } from 'rxjs';

import type { StoreDocument } from '@wcpos/database';

import { UserMenu } from './user-menu';

let populateCalls = 0;
let storesSource$: Observable<StoreDocument[]>;

/**
 * A fresh credentials document per test: `storeListResource` caches per document by design, so
 * sharing one across tests would serve the previous test's already-settled resource.
 */
let wpCredentials: Record<string, unknown>;

const freshCredentials = () => ({
	uuid: 'creds-1',
	display_name$: new BehaviorSubject<string | undefined>('Ada Lovelace'),
	avatar_url$: new BehaviorSubject<string | undefined>(undefined),
	// Two stores, so the switcher renders at all.
	stores$: new BehaviorSubject<unknown[]>([{ localID: 'store-1' }, { localID: 'store-2' }]),
	populate$: (field: string) => {
		expect(field).toBe('stores');
		populateCalls++;
		return storesSource$;
	},
});

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

function passthrough({ children }: { children?: React.ReactNode }) {
	return <div>{children}</div>;
}

jest.mock('@wcpos/components/avatar', () => ({
	Avatar: ({ fallback }: { fallback?: string }) => <span data-testid="avatar">{fallback}</span>,
	getInitials: (name?: string) => (name ?? '').slice(0, 1),
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
// Unlike `user-menu.test.tsx`, the menu bodies RENDER here: the suspending consumer lives
// inside `DropdownMenuSubContent`, and a stub that returns `null` is exactly what kept this
// out of the existing test.
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: passthrough,
	DropdownMenuContent: passthrough,
	DropdownMenuItem: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DropdownMenuSeparator: () => null,
	DropdownMenuSub: passthrough,
	DropdownMenuSubContent: passthrough,
	DropdownMenuSubTrigger: passthrough,
	DropdownMenuTrigger: passthrough,
}));
jest.mock('@wcpos/components/hstack', () => ({ HStack: passthrough }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: passthrough }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/portal', () => ({ Portal: passthrough }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: passthrough },
	FadeIn: { duration: () => ({}) },
}));
jest.mock('react-native', () => ({
	Linking: { openURL: jest.fn() },
	View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

/** Lets every pending microtask (and the React retry it schedules) run. */
const settle = async () => {
	for (let i = 0; i < 25; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
};

/** Emits one microtask after each subscribe — the shape of an RxDB `populate$`. */
const asyncStores = (): Observable<StoreDocument[]> =>
	new Observable<StoreDocument[]>((subscriber) => {
		void Promise.resolve().then(() =>
			subscriber.next([
				{ localID: 'store-1', name: 'One' } as unknown as StoreDocument,
				{ localID: 'store-2', name: 'Two' } as unknown as StoreDocument,
			])
		);
	});

const renderMenu = () =>
	render(
		<React.Suspense fallback={<div data-testid="route-fallback" />}>
			<UserMenu />
		</React.Suspense>
	);

beforeEach(() => {
	populateCalls = 0;
	wpCredentials = freshCredentials();
});

describe('user menu store switcher', () => {
	it('subscribes the stores resource once, however many times the menu re-renders', async () => {
		// The retry loop is only visible as a COUNT: each attempt built its own resource, and
		// each resource subscribed `populate$('stores')` again. One subscription means the
		// second attempt read back the resource the first one already had in flight, which is
		// what lets the first emission end the wait instead of starting the next one.
		storesSource$ = asyncStores();
		renderMenu();
		await settle();

		// The submenu renders one item per store; 'Two' can only be on screen if the resource
		// resolved and StoreSubMenu committed.
		expect(await screen.findByText('Two')).toBeTruthy();
		expect(populateCalls).toBe(1);
	});

	it('keeps the rest of the menu on screen while the store list is still loading', async () => {
		// A switcher that has not got its stores yet is a switcher-sized problem. Escaping to
		// the route boundary — production fallback `null` — is how it became a screen-sized one.
		storesSource$ = new Observable<StoreDocument[]>(() => {
			/* never emits */
		});
		renderMenu();
		await settle();

		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('clear-all-local-data')).toBeTruthy();
		expect(screen.queryByText('Two')).toBeNull();
	});
});
