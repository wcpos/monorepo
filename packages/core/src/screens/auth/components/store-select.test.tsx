/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { StoreSelect } from './store-select';
import { createTestT as mockCreateTestT } from '../../../../jest/translate';

const mockStores = new BehaviorSubject<unknown[]>([]);
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
	EmptyState: ({ title, description }: { title: string; description: string }) => (
		<section>
			{title}
			<p>{description}</p>
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
const wpUser = {
	uuid: 'user',
	get$: () => new BehaviorSubject(['a', 'b']),
	collection: { database: { stores: { find: () => ({ $: mockStores }) } } },
} as unknown as import('@wcpos/database').WPCredentialsDocument;
const a = { id: 1, localID: 'a', name: 'Store 1' };
const b = { id: 2, localID: 'b', name: 'Store 2' };
const onLogin = jest.fn();
function renderPicker() {
	return render(
		<StoreSelect
			site={site}
			wpUser={wpUser}
			selectedStoreId={null}
			onStoreSelect={jest.fn()}
			onLogin={onLogin}
		/>
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
