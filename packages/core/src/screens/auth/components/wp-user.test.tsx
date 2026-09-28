/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import { WpUser } from './wp-user';

let mockValid = false;
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockHandleLoginSuccess = jest.fn().mockResolvedValue(undefined);
const mockSetRefreshedToken = jest.fn();
const mockSetAuthFailed = jest.fn();

jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: () => null,
	AlertDialogAction: () => null,
	AlertDialogCancel: () => null,
	AlertDialogContent: () => null,
	AlertDialogDescription: () => null,
	AlertDialogFooter: () => null,
	AlertDialogHeader: () => null,
	AlertDialogTitle: () => null,
}));
jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null, getInitials: () => 'AU' }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, variant }: React.PropsWithChildren<{ variant: string }>) => (
		<button data-variant={variant}>{children}</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('react-native', () => ({
	Pressable: ({
		children,
		className,
		testID,
	}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
		<div data-testid={testID} className={className}>
			{children}
		</div>
	),
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	requestStateManager: {
		setRefreshedToken: (...args: unknown[]) => mockSetRefreshedToken(...args),
		setAuthFailed: (...args: unknown[]) => mockSetAuthFailed(...args),
	},
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		warn: (...args: unknown[]) => mockWarn(...args),
		error: (...args: unknown[]) => mockError(...args),
	}),
}));
jest.mock('../hooks/use-login-handler', () => ({
	useLoginHandler: () => ({
		handleLoginSuccess: (...args: unknown[]) => mockHandleLoginSuccess(...args),
	}),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../hooks/use-user-validation', () => ({
	useUserValidation: () => ({ isValid: mockValid, isLoading: false }),
}));
jest.mock('../../../hooks/use-wcpos-auth', () => ({
	useWcposAuth: () => ({
		response: {
			type: 'success',
			params: { id: '2', access_token: 'returned-token' },
		},
		promptAsync: jest.fn(),
	}),
}));

describe('WpUser re-authentication', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows a translated toast without exposing diagnostics when a different user returns', async () => {
		const site = {
			name: 'Example Store',
			wcpos_login_url: 'https://example.com/wcpos-login',
		} as import('@wcpos/database').SiteDocument;
		const wpUser = {
			id: 1,
			uuid: 'expected-user',
			display_name: 'Alice User',
		} as import('@wcpos/database').WPCredentialsDocument;

		render(<WpUser site={site} wpUser={wpUser} isSelected={false} onSelect={jest.fn()} />);

		await waitFor(() => expect(mockHandleLoginSuccess).toHaveBeenCalled());
		expect(mockWarn).toHaveBeenCalledWith(
			'Re-authentication returned a different user; credentials saved but token not adopted for active requests',
			{
				showToast: true,
				toast: { title: 'auth.signed_in_as_different_user' },
				context: { expectedId: 1, returnedId: '2' },
			}
		);
		expect(mockSetRefreshedToken).not.toHaveBeenCalled();
		expect(mockSetAuthFailed).not.toHaveBeenCalled();
	});
});

describe('user row status', () => {
	const site = { name: 'Store' } as import('@wcpos/database').SiteDocument;
	const wpUser = {
		id: 1,
		uuid: 'u',
		display_name: 'Alice',
	} as import('@wcpos/database').WPCredentialsDocument;
	it.each([true, false])('shows the valid=%s badge beneath the name', async (valid) => {
		mockValid = valid;
		render(<WpUser site={site} wpUser={wpUser} isSelected={false} onSelect={jest.fn()} />);
		await waitFor(() =>
			expect(screen.getByText(valid ? 'auth.signed_in' : 'auth.sign_in_again')).toBeTruthy()
		);
		if (!valid) expect(screen.getByRole('button').getAttribute('data-variant')).toBe('outline');
	});
	it('keeps border-primary on the selected invalid row', async () => {
		mockValid = false;
		render(<WpUser site={site} wpUser={wpUser} isSelected onSelect={jest.fn()} />);
		await waitFor(() =>
			expect(screen.getByTestId('wp-user-button').className).toContain('border-primary')
		);
		expect(screen.getByTestId('wp-user-button').className).not.toContain('border-warning');
	});
});
