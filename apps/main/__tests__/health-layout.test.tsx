import * as React from 'react';

import { act, create } from 'react-test-renderer';

import HealthLayout from '../app/(app)/(drawer)/health/_layout';

// Avoid jest-expo's winter runtime resolving lazy globals between tests.
jest.resetModules();

const mockLayoutProps: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({ Slot: () => null }));
jest.mock('@wcpos/core/contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/core/hooks/use-app-info', () => ({ useAppInfo: () => ({ license: null }) }));
jest.mock('@wcpos/core/screens/main/components/upgrade-notice', () => ({
	UpgradeNotice: () => null,
}));
jest.mock('@wcpos/core/screens/main/components/navigation-area', () => ({
	NavigationAreaLayout: (props: Record<string, unknown>) => {
		mockLayoutProps.push(props);
		return null;
	},
}));
jest.mock('../components/area-navigation/health', () => ({ useHealthNavigationItems: () => [] }));
jest.mock('../components/unread-logs', () => ({ useUnreadLogsCount: () => 0 }));

describe('Store health layout', () => {
	it('renders the shared page bar, keeping the bar title (its pages carry no heading)', () => {
		let view: ReturnType<typeof create>;
		act(() => {
			view = create(<HealthLayout />);
		});
		const props = mockLayoutProps.at(-1);
		expect(props?.barTestID).toBe('health-bar');
		expect(props?.screenTestID).toBe('health-screen');
		expect(props?.areaLabel).toBe('common.store_health');
		expect(props?.leafPagesCarryTitle).toBeUndefined();
		act(() => view.unmount());
	});
});
