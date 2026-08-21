import * as React from 'react';

import { act, create } from 'react-test-renderer';

import AppLayout from '../app/(app)/_layout';

// Avoid jest-expo's winter runtime resolving lazy globals between tests.
jest.resetModules();

const mockSite = { wp_api_url: 'https://example.com/wp-json/' };
const mockWpCredentials = { uuid: 'cashier-1' };
const mockUseUserValidation = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableEagerState: (observable: { value?: unknown }) => observable?.value,
}));
jest.mock('@wcpos/core/contexts/app-state', () => ({
	useAppState: () => ({ site: mockSite, wpCredentials: mockWpCredentials }),
}));
jest.mock('@wcpos/core/hooks/use-user-validation', () => ({
	useUserValidation: (props: unknown) => mockUseUserValidation(props),
}));
jest.mock('expo-router', () => ({}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/core/contexts/translations', () => ({ useT: () => (key: string) => key }));
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
jest.mock('@wcpos/core/screens/main/hooks/barcodes/device-scan-context', () => ({
	DeviceScanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
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
// Render null to cut the tree ABOVE AppStack — the useAppState mock has no
// store/storeDB, so AppStack cannot mount. ExtraDataProvider used to be the
// cut point here; it now lives inside AppStack (config-changed gating).
jest.mock('@wcpos/printer', () => ({
	RasterizeProvider: () => null,
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
		mockUseUserValidation.mockClear();
		let view: ReturnType<typeof create>;
		act(() => {
			view = create(<AppLayout />);
		});

		expect(mockUseUserValidation).toHaveBeenCalledWith({
			site: mockSite,
			wpUser: mockWpCredentials,
		});
		act(() => view.unmount());
	});
});
