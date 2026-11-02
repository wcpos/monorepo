/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';
import { BehaviorSubject, Subject } from 'rxjs';

import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { StoreSelect } from './store-select';
import { createTestT as mockCreateTestT } from '../../../../jest/translate';

let mockStores: Subject<unknown[] | typeof PENDING_USER_DB_READ> = new BehaviorSubject<
	unknown[] | typeof PENDING_USER_DB_READ
>([]);
jest.mock('@wcpos/query/user-db', () => ({
	PENDING_USER_DB_READ: Symbol('pending'),
	observeCredentialStores: () => mockStores,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		disabled,
		testID,
		onPress,
		ref,
	}: React.PropsWithChildren<{
		disabled: boolean;
		testID: string;
		onPress: () => void;
		ref?: React.Ref<HTMLButtonElement>;
	}>) => (
		<button ref={ref} data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/empty-state', () => ({
	// Mirrors the primitive: an inline empty state drops its description.
	EmptyState: ({
		title,
		description,
		size,
	}: {
		title: string;
		description: string;
		size?: string;
	}) => (
		<section>
			{title}
			{size !== 'inline' && <p>{description}</p>}
		</section>
	),
}));
jest.mock('@wcpos/components/radio-group', () => ({
	RadioGroup: ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
		<div role="radiogroup" data-value={value}>
			{children}
		</div>
	),
	RadioGroupOption: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => mockCreateTestT(),
}));
jest.mock('../../../hooks/use-user-validation', () => ({
	useUserValidation: () => ({ isValid: true, isLoading: false }),
}));
jest.mock('../../../services/register/use-register', () => ({ useRegister: () => null }));
const site = { uuid: 'site' } as import('@wcpos/database').SiteDocument;
let wpUser = {
	uuid: 'user',
} as unknown as import('@wcpos/database').WPCredentialsDocument;
const a = { id: 1, localID: 'a', name: 'Store 1' };
const b = { id: 2, localID: 'b', name: 'Store 2' };
const onLogin = jest.fn();
beforeEach(() => {
	mockStores = new BehaviorSubject<unknown[] | typeof PENDING_USER_DB_READ>([]);
	wpUser = { ...wpUser };
});
function renderPicker() {
	return render(
		<StoreSelect
			site={site}
			wpUser={wpUser}
			selectedStoreId={null}
			onStoreSelect={jest.fn()}
			onLogin={onLogin}
		/>,
		{
			wrapper: ({ children }) => (
				<React.Suspense fallback="Loading stores">{children}</React.Suspense>
			),
		}
	);
}
it('preselects a lone store and opens its localID', () => {
	mockStores.next([a]);
	renderPicker();
	expect(screen.getByText('Store')).toBeTruthy();
	expect(screen.getByRole('radiogroup').getAttribute('data-value')).toBe('a');
	fireEvent.click(screen.getByTestId('open-pos-button'));
	expect(onLogin).toHaveBeenCalledWith('a');
});
it('offers several stores without selecting one and addresses each by server id', () => {
	mockStores.next([a, b]);
	renderPicker();
	expect(screen.getByText('Choose a store')).toBeTruthy();
	expect(screen.getByRole('radiogroup').getAttribute('data-value')).toBe('');
	expect(screen.getByTestId('store-option-1')).toBeTruthy();
	expect(screen.getByTestId('store-option-2')).toBeTruthy();
	expect((screen.getByTestId('open-pos-button') as HTMLButtonElement).disabled).toBe(true);
});
it('shows the zero-store empty state and disables Open POS', () => {
	mockStores.next([]);
	renderPicker();
	expect(screen.getByText('No stores for this user')).toBeTruthy();
	expect(screen.getByText('Set up a POS store on the server, then sign in again.')).toBeTruthy();
	expect((screen.getByTestId('open-pos-button') as HTMLButtonElement).disabled).toBe(true);
});

it('suspends on mount and a credentials switch until each store read answers', async () => {
	mockStores.next(PENDING_USER_DB_READ);
	const view = renderPicker();
	expect(screen.getByText('Loading stores')).toBeTruthy();
	expect(screen.queryByText('No stores for this user')).toBeNull();
	await act(async () => {
		mockStores.next([a]);
	});
	expect(screen.getByRole('radiogroup').textContent).toContain('Store 1');
	expect(screen.queryByText('Loading stores')).toBeNull();

	mockStores = new BehaviorSubject<unknown[] | typeof PENDING_USER_DB_READ>(PENDING_USER_DB_READ);
	view.rerender(
		<StoreSelect
			site={site}
			wpUser={{ ...wpUser, uuid: 'next-cashier' }}
			selectedStoreId={null}
			onStoreSelect={jest.fn()}
			onLogin={onLogin}
		/>
	);
	expect(screen.getByText('Loading stores')).toBeTruthy();
	expect(screen.queryByRole('radiogroup')).toBeNull();
	expect(screen.queryByText('No stores for this user')).toBeNull();
	await act(async () => {
		mockStores.next([b]);
	});
	expect(screen.getByRole('radiogroup').textContent).toContain('Store 2');
	expect(screen.queryByText('Store 1')).toBeNull();
	expect(screen.queryByText('Loading stores')).toBeNull();
});

it('never commits the previous cashier stores or enabled Open POS after switching', async () => {
	mockStores.next([a]);
	const commits: { rows: string[]; disabled: boolean | undefined }[] = [];
	const picker = (user: typeof wpUser) => (
		<React.Profiler
			id="picker"
			onRender={() => {
				commits.push({
					rows: screen.queryAllByTestId(/^store-option-/).map((row) => row.textContent ?? ''),
					disabled: screen.queryByTestId<HTMLButtonElement>('open-pos-button')?.disabled,
				});
			}}
		>
			<React.Suspense fallback="Loading stores">
				<StoreSelect
					site={site}
					wpUser={user}
					selectedStoreId={null}
					onStoreSelect={jest.fn()}
					onLogin={onLogin}
				/>
			</React.Suspense>
		</React.Profiler>
	);
	const view = render(picker(wpUser));
	expect(screen.getByTestId<HTMLButtonElement>('open-pos-button').disabled).toBe(false);
	mockStores = new Subject();
	view.rerender(picker({ ...wpUser, uuid: 'next-cashier' }));
	expect(screen.getByText('Loading stores')).toBeTruthy();
	commits.length = 0;
	await act(async () => {
		mockStores.next([b, { id: 3, localID: 'c', name: 'Store 3' }]);
	});
	// Profiler runs at commit, before the hook's passive subscription can repair stale state.
	expect(commits.length).toBeGreaterThan(0);
	for (const commit of commits) {
		expect(commit.rows).toEqual(['Store 2', 'Store 3']);
		expect(commit.disabled).toBe(true);
	}
	expect(screen.getByRole('radiogroup').getAttribute('data-value')).toBe('');
});

it('rebuilds an errored resource when the picker error boundary is reset', async () => {
	mockStores = new Subject();
	render(
		<ErrorBoundary
			fallbackRender={({ resetErrorBoundary }) => (
				<button onClick={resetErrorBoundary}>Dismiss error</button>
			)}
		>
			<React.Suspense fallback="Loading stores">
				<StoreSelect
					site={site}
					wpUser={wpUser}
					selectedStoreId={null}
					onStoreSelect={jest.fn()}
					onLogin={onLogin}
				/>
			</React.Suspense>
		</ErrorBoundary>,
		{ onCaughtError: () => {} }
	);
	await act(async () => {
		mockStores.error(new Error('transient storage failure'));
	});
	expect(screen.getByText('Dismiss error')).toBeTruthy();
	mockStores = new Subject();
	fireEvent.click(screen.getByText('Dismiss error'));
	expect(screen.getByText('Loading stores')).toBeTruthy();
	await act(async () => {
		mockStores.next([b]);
	});
	expect(screen.queryByText('Dismiss error')).toBeNull();
	expect(screen.getByTestId('store-option-2').textContent).toBe('Store 2');
	expect(screen.getByTestId<HTMLButtonElement>('open-pos-button').disabled).toBe(false);
	fireEvent.click(screen.getByTestId('open-pos-button'));
	expect(onLogin).toHaveBeenLastCalledWith('b');
});
