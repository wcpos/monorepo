/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { clearUpdateRequired, reportUpdateRequired } from '@wcpos/utils/update-required-gate';

import { AccordionSiteContent } from './sites';
import en from '../../../contexts/translations/locales/en/core.json';

let mockWcposVersionPass = true;
let mockIsWeb = true;

jest.mock('@wcpos/utils/platform', () => ({
	Platform: {
		get isWeb() {
			return mockIsWeb;
		},
	},
}));
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
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: () => null,
	DropdownMenuContent: () => null,
	DropdownMenuItem: () => null,
	DropdownMenuTrigger: () => null,
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
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ compatibility: { wcposVersionPass: mockWcposVersionPass } }),
}));
jest.mock('@wcpos/components/notice', () => {
	const { Text } = jest.requireActual('react-native');
	return { Notice: ({ title }: { title: string }) => <Text>{title}</Text> };
});

jest.mock('@wcpos/components/accordion', () => ({
	Accordion: () => null,
	AccordionContent: () => null,
	AccordionItem: () => null,
	AccordionTrigger: () => null,
}));
jest.mock('@wcpos/components/card', () => ({ Card: () => null }));
jest.mock('@wcpos/components/status-badge', () => ({ StatusBadge: () => null }));
jest.mock('@wcpos/query', () => ({ useDocField: () => undefined }));
jest.mock('observable-hooks', () => ({ useObservableSuspense: () => [] }));
jest.mock('../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => null,
}));

const WP_API_URL = 'https://example.com/wp-json/';
const DETAILS = { minProtocol: 3, serverProtocol: 3, pluginVersion: '2.0.0', status: 426 };

const site = {
	uuid: 'site-1',
	name: 'Example Store',
	url: 'https://example.com',
	wp_api_url: WP_API_URL,
} as unknown as import('@wcpos/database').SiteDocument;

/**
 * With more than one saved site the login card is an accordion; its content
 * must gate exactly like the single-site card (wcpos/monorepo#2792 review).
 */
describe('AccordionSiteContent and the update-required gate', () => {
	beforeEach(() => {
		mockWcposVersionPass = true;
		mockIsWeb = true;
		clearUpdateRequired(WP_API_URL);
	});

	it('renders the users list while the site is not gated', () => {
		render(<AccordionSiteContent site={site} />);

		expect(screen.getByTestId('wp-users-sentinel')).toBeTruthy();
		expect(screen.queryByTestId('update-required-card-notice')).toBeNull();
	});

	it('swaps the users list for the update notice when the site is gated', () => {
		reportUpdateRequired(WP_API_URL, DETAILS);

		render(<AccordionSiteContent site={site} />);

		expect(screen.getByTestId('update-required-card-notice')).toBeTruthy();
		expect(screen.getByTestId('update-required-reload')).toBeTruthy();
		expect(screen.queryByTestId('wp-users-sentinel')).toBeNull();
	});

	it('shows the plugin-too-old warning ahead of the update notice', () => {
		mockWcposVersionPass = false;
		reportUpdateRequired(WP_API_URL, DETAILS);

		render(<AccordionSiteContent site={site} />);

		expect(screen.queryByTestId('update-required-card-notice')).toBeNull();
		expect(screen.queryByTestId('wp-users-sentinel')).toBeNull();
		expect(screen.getByText(en['auth.update_plugin_to_continue'])).toBeTruthy();
	});
});
