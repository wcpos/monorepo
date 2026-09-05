/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { CustomerDisplaySettings } from './index';
import {
	getCustomerDisplayService,
	startCustomerDisplayService,
	stopCustomerDisplayService,
} from '../../../../services/customer-display';

// Cold load of /pos/settings/customer-display (wcpos/roadmap#129): the page
// mounts before the root hook has resolved the device id and started the
// service. Unlike index.test.tsx this file keeps the REAL service module and
// its start/stop notifier, and jest.config.js compiles index.tsx with the React
// Compiler exactly as the app build does, so a module-level read the compiler
// caches for the life of the mount fails here the way it failed on dev-next.

let store: { display?: { contract: number; signaling: string } } = {};
const site = { url: 'https://example.com/shop', use_rest_route_param: true };

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <div>{children}</div> : null,
	AlertDialogAction: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
	AlertDialogCancel: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		disabled,
		onPress,
		testID,
	}: React.PropsWithChildren<{ disabled?: boolean; onPress?: () => void; testID?: string }>) => (
		<button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children }: React.PropsWithChildren) => <a>{children}</a>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/query', () => ({
	useDocField: (document: unknown, selector: (value: never) => unknown) =>
		selector(document as never),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store, site }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ dateFnsLocale: undefined }),
}));
jest.mock('../components/settings-row', () => ({
	SettingsRow: ({ children, label }: React.PropsWithChildren<{ label: string }>) => (
		<div>
			<span>{label}</span>
			{children}
		</div>
	),
}));
jest.mock('../components/settings-section', () => ({
	SettingsSection: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
}));

// The root hook resolves getDeviceId() before it starts the service; the page
// has long since committed by then. One macrotask stands in for that gap.
const startServiceAfterMount = () =>
	new Promise<void>((resolve) => {
		setTimeout(() => {
			startCustomerDisplayService({
				http: async () => ({ data: [] }) as never,
				deviceId: 'device-1',
				storeId: 7,
				siteRestRoot: 'display',
			});
			resolve();
		}, 0);
	});

describe('CustomerDisplaySettings cold start (real service module)', () => {
	beforeEach(() => {
		stopCustomerDisplayService();
		store = { display: { contract: 1, signaling: '/wcpos/v2/display' } };
	});
	afterEach(() => act(() => stopCustomerDisplayService()));

	it('enables pairing when the service starts after the page has mounted', async () => {
		render(<CustomerDisplaySettings />);
		expect(getCustomerDisplayService()).toBeNull();
		expect(screen.getByTestId('customer-display-pair-button')).toBeDisabled();
		expect(screen.getByTestId('customer-display-service-unavailable')).toBeInTheDocument();

		await act(startServiceAfterMount);

		expect(getCustomerDisplayService()).not.toBeNull();
		expect(screen.getByTestId('customer-display-pair-button')).toBeEnabled();
		expect(screen.queryByTestId('customer-display-service-unavailable')).not.toBeInTheDocument();
	});

	it('disables pairing again when the service stops', async () => {
		await act(startServiceAfterMount);
		render(<CustomerDisplaySettings />);
		expect(screen.getByTestId('customer-display-pair-button')).toBeEnabled();

		act(() => stopCustomerDisplayService());

		expect(screen.getByTestId('customer-display-pair-button')).toBeDisabled();
	});
});
