/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { StoreSelect } from './store-select';
import { createTestT as mockCreateTestT } from '../../../../jest/translate';

let mockStores = new BehaviorSubject<unknown[] | typeof PENDING_USER_DB_READ>([]);
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
