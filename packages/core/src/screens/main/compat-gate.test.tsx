/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { CompatGate } from './compat-gate';

const mockOrder: string[] = [];
const mockClearSitePluginVersions = jest.fn();
const mockLogout = jest.fn();
const mockGet = jest.fn();
const mockHttp = { get: mockGet };

jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('../../../../query/src/user-db/sites'),
	clearSitePluginVersions: (...args: unknown[]) => mockClearSitePluginVersions(...args),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({ useHttpClient: () => mockHttp }));
jest.mock('../../contexts/app-state', () => ({ useAppState: () => ({ logout: mockLogout }) }));
jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
jest.mock('@wcpos/components/docs-link', () => {
	const { Text } = jest.requireActual('react-native');
	return { DocsLink: ({ testID }: { testID?: string }) => <Text testID={testID} /> };
});
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/logo', () => ({ Logo: () => null }));
jest.mock('../../contexts/translations', () => {
	const { createTestT } =
		jest.requireActual<typeof import('../../../jest/translate')>('../../../jest/translate');
	return { useT: () => createTestT() };
});

const API_URL = 'https://store.example.test/wp-json/';

function makeSite(wcposVersion: string) {
	const state$ = new BehaviorSubject<Record<string, unknown>>({
		wp_api_url: API_URL,
		wcpos_version: wcposVersion,
		wcpos_pro_version: '',
	});
	return {
		wp_api_url: API_URL,
		$: state$,
		getLatest: () => ({ deleted: false }),
		incrementalPatch: async (patch: Record<string, unknown>) => {
			state$.next({ ...state$.getValue(), ...patch });
		},
	} as never;
}

const renderGate = (liveVersion: string) => {
	mockGet.mockResolvedValue({ status: 200, data: { wcpos_version: liveVersion } });
	render(
		<CompatGate site={makeSite('1.11.4')}>
			<span data-testid="pos">POS</span>
		</CompatGate>
	);
};

describe('CompatGate', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockOrder.length = 0;
		mockClearSitePluginVersions.mockImplementation(async () => {
			mockOrder.push('clear');
		});
		mockLogout.mockImplementation(async () => {
			mockOrder.push('logout');
		});
	});

	it('renders the POS when the saved version is stale but the store reports 2.0.1', async () => {
		renderGate('2.0.1');

		await waitFor(() => expect(screen.getByTestId('pos')).toBeTruthy());
		expect(screen.queryByTestId('upgrade-required-screen')).toBeNull();
	});

	it('renders the upgrade gate when the store itself still reports 1.x', async () => {
		renderGate('1.11.4');

		await waitFor(() =>
			expect(screen.getByTestId('upgrade-required-check-again').textContent).toBe('Check again')
		);
		expect(screen.getByTestId('upgrade-required-screen')).toBeTruthy();
		expect(screen.queryByTestId('pos')).toBeNull();
	});

	it('Logout clears the saved plugin version, then logs out', async () => {
		renderGate('1.11.4');
		await waitFor(() => expect(screen.getByTestId('upgrade-required-logout')).toBeTruthy());

		fireEvent.click(screen.getByTestId('upgrade-required-logout'));

		await waitFor(() => expect(mockOrder).toEqual(['clear', 'logout']));
	});

	it('Logout still logs out when clearing the saved version throws', async () => {
		mockClearSitePluginVersions.mockRejectedValue(new Error('Cannot update a removed site'));
		renderGate('1.11.4');
		await waitFor(() => expect(screen.getByTestId('upgrade-required-logout')).toBeTruthy());

		fireEvent.click(screen.getByTestId('upgrade-required-logout'));

		await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
	});
});
