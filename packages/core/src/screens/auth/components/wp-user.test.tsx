/** @jest-environment jsdom */
import * as React from 'react';

import { render, waitFor } from '@testing-library/react';

import { WpUser } from './wp-user';

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
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('@wcpos/components/list-item', () => ({ ListItem: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
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
	useUserValidation: () => ({ isValid: false, isLoading: false }),
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
