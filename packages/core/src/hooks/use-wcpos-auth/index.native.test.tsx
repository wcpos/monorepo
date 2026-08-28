/**
 * @jest-environment jsdom
 *
 * Pins the Android Custom Tab task placement. `promptAsync` defaults to
 * `createTask: true`, which opens the tab as a SECOND task under the app's
 * package: after login both tasks sit in recents, and a later launch (app
 * icon, or Maestro's launchApp) can raise the BROWSER task — a dead login
 * page over a healthy, logged-in app. Seen four times on the native suite
 * 2026-08-28 (runs 33176268259, 33196506511).
 *
 * The option is invisible to every other test — nothing renders it, and the
 * only proof it survives a refactor is this call-shape assertion.
 */
import { act, renderHook } from '@testing-library/react';

import { useWcposAuth } from './index';

const promptAsync = jest.fn(async () => ({ type: 'dismiss' }));

jest.mock('expo-auth-session', () => ({
	ResponseType: { Token: 'token' },
	useAuthRequest: jest.fn(() => [{ url: 'https://example.com/authorize' }, null, promptAsync]),
}));

jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: { platform: 'android', version: '1.0.0', buildNumber: '1' },
}));

jest.mock('./utils', () => ({
	getRedirectUri: jest.fn(() => 'wcpos://auth'),
}));

const site = { wcpos_login_url: 'https://example.com/wcpos-auth/' } as never;

beforeEach(() => {
	promptAsync.mockClear();
});

describe('useWcposAuth (native)', () => {
	it('opens the Custom Tab in the app task, never its own', async () => {
		const { result } = renderHook(() => useWcposAuth({ site }));

		await act(async () => {
			await result.current.promptAsync();
		});

		expect(promptAsync).toHaveBeenCalledTimes(1);
		// The assertion that matters: createTask false, explicitly.
		expect(promptAsync).toHaveBeenCalledWith(expect.objectContaining({ createTask: false }));
	});

	it('does not prompt before the auth request is ready', async () => {
		const { useAuthRequest } = jest.requireMock('expo-auth-session');
		useAuthRequest.mockReturnValueOnce([null, null, promptAsync]);

		const { result } = renderHook(() => useWcposAuth({ site }));
		await act(async () => {
			await result.current.promptAsync();
		});

		expect(promptAsync).not.toHaveBeenCalled();
	});
});
