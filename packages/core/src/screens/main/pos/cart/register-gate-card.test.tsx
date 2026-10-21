/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { openExternalURL } from '@wcpos/utils/open-external-url';

import { RegisterGateCard } from './register-gate-card';

let mockCapabilities: string[] = [];
const mockRetry = jest.fn(async () => undefined);
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { url: 'https://shop.example///' },
		wpCredentials: { capabilities: mockCapabilities },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ retry: mockRetry }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockCapabilities = [];
});

it('shows the no-register title and register guide for a cashier', () => {
	render(<RegisterGateCard failed={false} />);
	expect(screen.getByTestId('register-gate-card-title').textContent).toBe(
		'register.no_register_for_store'
	);
	expect(screen.getByTestId('register-gate-card-description').textContent).toBe(
		'register.manager_adds_one_in_stores'
	);
	expect(screen.getByTestId('register-gate-docs').textContent).toBe('register.register_guide');
	expect(screen.queryByTestId('register-gate-admin')).toBeNull();
	fireEvent.click(screen.getByTestId('register-gate-docs'));
	expect(openExternalURL).toHaveBeenCalledWith(
		'https://docs.wcpos.com/stores/registers-and-devices'
	);
});

it('opens Stores instead of the guide for a manager', () => {
	mockCapabilities = ['manage_woocommerce_pos'];
	render(<RegisterGateCard failed={false} />);
	expect(screen.getByTestId('register-gate-admin').textContent).toBe('register.open_stores');
	expect(screen.queryByTestId('register-gate-docs')).toBeNull();
	fireEvent.click(screen.getByTestId('register-gate-admin'));
	expect(openExternalURL).toHaveBeenCalledWith(
		'https://shop.example/wp-admin/edit.php?post_type=wcpos_store'
	);
});

it('shows the cannot-reach title after a directory failure', () => {
	render(<RegisterGateCard failed />);
	expect(screen.getByTestId('register-gate-card-title').textContent).toBe(
		'register.cannot_reach_registers'
	);
	expect(screen.getByTestId('register-gate-card-description').textContent).toBe(
		'register.check_connection_then_try_again'
	);
});

it('retries when Try again is pressed', () => {
	render(<RegisterGateCard failed />);
	expect(screen.getByTestId('register-gate-retry').textContent).toBe('register.try_again');
	fireEvent.click(screen.getByTestId('register-gate-retry'));
	expect(mockRetry).toHaveBeenCalledTimes(1);
});
