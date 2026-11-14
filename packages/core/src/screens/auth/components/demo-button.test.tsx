/** @jest-environment jsdom */
import * as React from 'react';

import { from } from 'rxjs';
import { act, render, waitFor } from '@testing-library/react';

import {
	__resetRedirectResultForTesting,
	saveRedirectState,
} from '../../../hooks/use-wcpos-auth/redirect-result';
import { DEMO_CLAIM_KEY, DemoButton } from './demo-button';
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeUserSites: () => from(mockUser.populate()),
}));

const mockExpoPromptAsync = jest.fn();
const mockError = jest.fn();
const mockHandleLoginSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnConnect = jest.fn();
let mockSites: { wcpos_login_url: string; name: string }[];
const mockUser = { populate: jest.fn(async () => mockSites) };

jest.mock('../../../hooks/use-wcpos-auth', () =>
	jest.requireActual('../../../hooks/use-wcpos-auth/index.web')
);
jest.mock('expo-auth-session', () => ({
	makeRedirectUri: jest.fn(() => 'http://localhost/'),
	ResponseType: { Token: 'token' },
	useAuthRequest: () => [{}, null, mockExpoPromptAsync],
}));
jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: { platform: 'web', version: '0.0.0', buildNumber: '0' },
}));
jest.mock('@wcpos/components/button', () => ({ Button: () => null, ButtonText: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
const mockToastShow = jest.fn();
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (props: unknown) => mockToastShow(props) },
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		warn: jest.fn(),
		error: (...args: unknown[]) => mockError(...args),
	}),
	getErrorMessage: (e: unknown) => String(e),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../hooks/use-login-handler', () => ({
	useLoginHandler: () => ({ handleLoginSuccess: mockHandleLoginSuccess, isProcessing: false }),
}));
jest.mock('../hooks/use-site-connect', () => ({
	useSiteConnect: () => ({ onConnect: mockOnConnect, loading: false }),
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ user: mockUser }),
}));

const DEMO_LOGIN_URL = 'https://demo.wcpos.com/wcpos-login';
const CSRF = 'c'.repeat(64);

function simulateRedirectReturn(claimKey: string) {
	saveRedirectState(DEMO_LOGIN_URL, CSRF, claimKey);
	window.history.replaceState(
		{},
		'',
		`/?access_token=at123&refresh_token=rt456&uuid=uuid-1&id=7` +
			`&display_name=Demo&expires_at=1755648000&state=${CSRF}`
	);
}

beforeEach(() => {
	jest.clearAllMocks();
	__resetRedirectResultForTesting();
	sessionStorage.clear();
	window.history.replaceState({}, '', '/');
	mockSites = [{ wcpos_login_url: DEMO_LOGIN_URL, name: 'Demo' }];
});

describe('DemoButton redirect-return login', () => {
	it('completes the demo login when the popup-blocked redirect returns', async () => {
		simulateRedirectReturn(DEMO_CLAIM_KEY);
		render(<DemoButton />);

		await waitFor(() =>
			expect(mockHandleLoginSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({ access_token: 'at123' }),
				})
			)
		);
		expect(mockExpoPromptAsync).not.toHaveBeenCalled();
		expect(mockOnConnect).not.toHaveBeenCalled();
	});

	it('ignores a redirect result started by another consumer of the demo site', async () => {
		simulateRedirectReturn('add-user');
		render(<DemoButton />);

		await act(async () => {});
		expect(mockUser.populate).not.toHaveBeenCalled();
		expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
	});

	it('surfaces an error when the demo site is no longer stored', async () => {
		simulateRedirectReturn(DEMO_CLAIM_KEY);
		mockSites = [];
		render(<DemoButton />);

		await waitFor(() =>
			expect(mockError).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ showToast: true })
			)
		);
		expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
	});

	it('writes no second coded row when the auth hook already reported the failure', async () => {
		saveRedirectState(DEMO_LOGIN_URL, CSRF, DEMO_CLAIM_KEY);
		window.history.replaceState(
			{},
			'',
			`/?access_token=at123&refresh_token=rt456&uuid=uuid-1&id=7&state=${'d'.repeat(64)}`
		);
		render(<DemoButton />);

		await waitFor(() =>
			expect(mockToastShow).toHaveBeenCalledWith(
				expect.objectContaining({ title: 'auth.login_did_not_complete' })
			)
		);
		// One incident, one row: the redirect handler's own state-mismatch row.
		expect(mockError).toHaveBeenCalledTimes(1);
		expect(mockError).toHaveBeenCalledWith(
			'State parameter mismatch - possible CSRF attack',
			expect.objectContaining({ code: 'AUTH999' })
		);
		expect(mockHandleLoginSuccess).not.toHaveBeenCalled();
	});

	it('does nothing on a normal load', async () => {
		render(<DemoButton />);

		await act(async () => {});
		expect(mockUser.populate).not.toHaveBeenCalled();
	});
});
