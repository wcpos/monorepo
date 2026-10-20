/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { clearUpdateRequired, reportUpdateRequired } from '@wcpos/utils/update-required-gate';

import { Site } from './site';
import en from '../../../contexts/translations/locales/en/core.json';

let mockWcposVersionPass = true;

jest.mock('@wcpos/utils/platform', () => ({ Platform: { isWeb: true } }));
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
jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null, getInitials: () => 'ES' }));
jest.mock('@wcpos/components/button', () => {
	const { Pressable, Text } = jest.requireActual('react-native');
	return { Button: Pressable, ButtonText: Text };
});
jest.mock('@wcpos/components/docs-link', () => {
	const { Text } = jest.requireActual('react-native');
	return { DocsLink: Text };
});
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/hstack', () => {
	const { View } = jest.requireActual('react-native');
	return { HStack: View };
});
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});
jest.mock('@wcpos/components/vstack', () => {
	const { View } = jest.requireActual('react-native');
	return { VStack: View };
});
jest.mock('./wp-users', () => {
	const { View } = jest.requireActual('react-native');
	return { WPUsers: () => <View testID="wp-users-sentinel" /> };
});
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('../../../hooks/use-site-info', () => ({ useSiteInfo: () => undefined }));
jest.mock('../../../hooks/use-version-check', () => ({
	useVersionCheck: () => ({ wcposVersionPass: mockWcposVersionPass }),
}));

const WP_API_URL = 'https://example.com/wp-json/';
const DETAILS = { minProtocol: 3, serverProtocol: 3, pluginVersion: '2.0.0', status: 426 };

const site = {
	uuid: 'site-1',
	name: 'Example Store',
	url: 'https://example.com',
	wp_api_url: WP_API_URL,
} as unknown as import('@wcpos/database').SiteDocument;
const user = {} as import('@wcpos/database').UserDocument;

describe('Site login card and the update-required gate', () => {
	beforeEach(() => {
		mockWcposVersionPass = true;
		clearUpdateRequired(WP_API_URL);
	});

	it('swaps the users list for the update notice while the site is gated', () => {
		render(<Site user={user} site={site} />);

		expect(screen.getByTestId('wp-users-sentinel')).toBeTruthy();
		expect(screen.queryByTestId('update-required-card-notice')).toBeNull();

		act(() => reportUpdateRequired(WP_API_URL, DETAILS));

		expect(screen.queryByTestId('wp-users-sentinel')).toBeNull();
		expect(screen.getByTestId('update-required-card-notice')).toBeTruthy();
		expect(screen.getByTestId('update-required-docs-link-SYNC341')).toBeTruthy();
		expect(screen.getByTestId('update-required-reload')).toBeTruthy();

		act(() => clearUpdateRequired(WP_API_URL));

		expect(screen.getByTestId('wp-users-sentinel')).toBeTruthy();
		expect(screen.queryByTestId('update-required-card-notice')).toBeNull();
	});

	it('is already gated when the engine latched the site before the card mounted', () => {
		// The in-app screen's Logout lands here; the engine reported under the
		// scheme-less key variant — siteKey() canonicalises it.
		reportUpdateRequired('example.com/wp-json', DETAILS);

		render(<Site user={user} site={site} />);

		expect(screen.getByTestId('update-required-card-notice')).toBeTruthy();
		expect(screen.queryByTestId('wp-users-sentinel')).toBeNull();
	});

	it('shows the plugin-too-old warning ahead of the update notice', () => {
		mockWcposVersionPass = false;
		reportUpdateRequired(WP_API_URL, DETAILS);

		render(<Site user={user} site={site} />);

		expect(screen.queryByTestId('update-required-card-notice')).toBeNull();
		expect(screen.queryByTestId('wp-users-sentinel')).toBeNull();
		expect(screen.getByText(en['common.please_update_your_woocommerce_pos_plugin'])).toBeTruthy();
	});
});
