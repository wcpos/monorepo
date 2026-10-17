import * as React from 'react';
import { Platform } from 'react-native';

import { act, create } from 'react-test-renderer';

import AppLayout from '../app/(app)/_layout';
import { createSessionFetcherOptions } from '../lib/create-app-engine';

// Avoid jest-expo's winter runtime resolving lazy globals between tests.
jest.resetModules();
Object.assign(window, { addEventListener: jest.fn(), removeEventListener: jest.fn() });

const mockSite = { wp_api_url: 'https://example.com/wp-json/', use_instance_header: false };
const mockT = (key: string) => key;
const mockWpCredentials = { uuid: 'cashier-1' };
const mockUseUserValidation = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: { value?: unknown }) => observable?.value,
}));
jest.mock('@wcpos/core/contexts/app-state', () => {
	const useAppState = () => ({
		site: mockSite,
		wpCredentials: mockWpCredentials,
		store: { id: 1 },
	});
	return { useAppState, useStoreSession: useAppState };
});
jest.mock('@wcpos/core/hooks/use-user-validation', () => ({
	useUserValidation: (props: unknown) => mockUseUserValidation(props),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/core/contexts/translations', () => ({ useT: () => mockT }));
jest.mock('@wcpos/core/contexts/app-state/engine-scope-port', () => ({
	registerEngineScopeSwitcher: jest.fn(),
}));
jest.mock('@wcpos/core/hooks/use-app-info', () => ({ useAppInfo: jest.fn() }));
jest.mock('@wcpos/core/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }));
jest.mock('@wcpos/core/hooks/use-site-info', () => ({ useSiteInfo: jest.fn() }));
jest.mock('@wcpos/core/screens/main/receipt/email-queue/bridge', () => ({
	ReceiptEmailQueueBridge: () => null,
}));
jest.mock('@wcpos/core/screens/main/contexts/ui-settings', () => ({
	UISettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/core/screens/main/hooks/barcodes/scan-hub-context', () => ({
	ScanHubProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/core/screens/main/update-required', () => ({ UpdateRequired: () => null }));
jest.mock('@wcpos/core/screens/main/upgrade-required', () => ({ UpgradeRequired: () => null }));
jest.mock('@wcpos/core/screens/main/hooks/use-collection', () => ({
	useCollection: () => ({ collection: {} }),
}));
jest.mock('@wcpos/core/screens/main/hooks/use-rest-http-client/refresh-http-client', () => ({
	createRefreshHttpClient: jest.fn(),
}));
jest.mock('@wcpos/hooks/use-http-client/refresh-access-token', () => ({
	refreshAccessToken: jest.fn(),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	OnlineStatusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useOnlineStatus: () => ({ status: 'online' }),
}));
jest.mock('@wcpos/core/screens/main/components/online-status/online-status-logger', () => ({
	OnlineStatusLogger: () => null,
}));
jest.mock('@wcpos/core/screens/main/contexts/extra-data', () => ({
	ExtraDataProvider: () => null,
}));
jest.mock('@wcpos/printer', () => ({
	RasterizeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/query', () => ({
	QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	// Field-hook passthrough: reads the plain fixture field synchronously.
	useDocField: (source: Record<string, unknown>, select: (value: unknown) => unknown) =>
		select(source),
}));
jest.mock('@wcpos/utils/user-activity', () => ({ markUserActivity: jest.fn() }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: jest.fn() }),
	setDatabase: jest.fn(),
}));
jest.mock('../components/sync-config-bridge', () => ({ SyncConfigBridge: () => null }));
jest.mock('../components/use-navigation-background', () => ({
	useNavigationBackground: () => '#fff',
}));
jest.mock('../lib/connectivity', () => ({ setAppOnlineStatus: jest.fn() }));
jest.mock('../lib/create-app-engine', () => ({
	createAppSyncEngine: jest.fn(),
	createSessionFetcherOptions: jest.fn(() => ({})),
	switchAppEngineScope: jest.fn(),
}));
jest.mock('../lib/metrics', () => ({
	getMetricsBuckets: jest.fn(),
	hydrateMetricsBuckets: jest.fn(),
	resetMetricsBuckets: jest.fn(),
}));
jest.mock('../lib/sync-status-persistence-bridge', () => ({
	SyncStatusPersistenceBridge: () => null,
}));

describe('authenticated user validation', () => {
	it('refreshes the hydrated cashier when the app layout mounts', () => {
		jest.replaceProperty(Platform, 'OS', 'web');
		mockUseUserValidation.mockClear();
		let view: ReturnType<typeof create>;
		act(() => {
			view = create(<AppLayout />);
		});

		expect(mockUseUserValidation).toHaveBeenCalledWith({
			site: mockSite,
			wpUser: mockWpCredentials,
		});
		for (const verdict of [false, true]) {
			mockSite.use_instance_header = verdict;
			act(() => view.update(<AppLayout />));
			expect(createSessionFetcherOptions).toHaveBeenLastCalledWith(
				expect.objectContaining({ use_instance_header: verdict }),
				mockWpCredentials,
				expect.any(String)
			);
		}
		act(() => view.unmount());
		jest.restoreAllMocks();
	});
});
