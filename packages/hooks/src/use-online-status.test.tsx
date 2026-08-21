import * as React from 'react';

import { type NetInfoStateType, useNetInfoInstance } from '@react-native-community/netinfo';
import { act, render } from '@testing-library/react';

import { OnlineStatusProvider } from './use-online-status';

jest.mock('@react-native-community/netinfo', () => ({
	useNetInfoInstance: jest.fn(),
}));

const useNetInfoInstanceMock = jest.mocked(useNetInfoInstance);

function renderProvider(wpAPIURL: string) {
	return render(
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<div />
		</OnlineStatusProvider>
	);
}

function getLatestConfig() {
	const config = useNetInfoInstanceMock.mock.calls.at(-1)?.[1];
	if (!config) throw new Error('Expected NetInfo configuration');
	return config;
}

describe('OnlineStatusProvider', () => {
	beforeEach(() => {
		useNetInfoInstanceMock.mockReset();
		useNetInfoInstanceMock.mockReturnValue({
			netInfo: {
				type: 'other' as NetInfoStateType.other,
				isConnected: true,
				isInternetReachable: true,
				details: { isConnectionExpensive: false },
			},
			refresh: jest.fn(),
		});
	});

	it.each([
		['https://example.com/wp-json', 'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://example.com/wp-json/', 'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://example.com/?rest_route=/', 'https://example.com/?rest_route=/wcpos/v2/ping&wcpos=1'],
	])('derives the ping URL from %s', (wpAPIURL, expectedPingURL) => {
		renderProvider(wpAPIURL);

		expect(getLatestConfig().reachabilityUrl).toBe(expectedPingURL);
	});

	it('falls back to the REST index after a 404 and counts that probe as reachable', async () => {
		const wpAPIURL = 'https://example.com/wp-json/';
		renderProvider(wpAPIURL);
		const pingConfig = getLatestConfig();
		const reachabilityTest = pingConfig.reachabilityTest;
		if (!reachabilityTest) throw new Error('Expected reachability test');

		let isReachable = false;
		await act(async () => {
			isReachable = await reachabilityTest({ status: 404 } as Response);
		});

		expect(isReachable).toBe(true);
		expect(getLatestConfig().reachabilityUrl).toBe(wpAPIURL);
	});

	it('stays on the ping URL after a 200', async () => {
		renderProvider('https://example.com/wp-json/');
		const pingConfig = getLatestConfig();
		const reachabilityTest = pingConfig.reachabilityTest;
		if (!reachabilityTest) throw new Error('Expected reachability test');

		await expect(reachabilityTest({ status: 200 } as Response)).resolves.toBe(true);
		expect(getLatestConfig().reachabilityUrl).toBe(
			'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'
		);
	});
});
