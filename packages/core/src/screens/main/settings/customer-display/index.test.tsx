/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { CustomerDisplaySettings } from './index';

const mintPairingCode = jest.fn().mockResolvedValue({
	code: '482193',
	expires_at: 1788437400,
});
const refreshDisplays = jest.fn().mockResolvedValue(undefined);
const forget = jest.fn().mockResolvedValue(undefined);
const subscribe = jest.fn(() => jest.fn());
const getState = jest.fn(() => ({
	displays: [
		{
			id: 'display-1',
			name: 'Counter screen',
			device_id: 'device-1',
			store_id: 7,
			paired_at: 1788429600,
			last_seen: 1788436800,
			connected: true,
		},
		{
			id: 'display-2',
			name: 'Window screen',
			device_id: 'device-1',
			store_id: 7,
			paired_at: 1788429600,
			last_seen: 0,
			connected: false,
		},
	],
	pairingCode: { code: '482193', expires_at: 1788437400 },
}));
const mockCustomerDisplayService = {
	forget,
	getState,
	mintPairingCode,
	refreshDisplays,
	subscribe,
};
const mockClipboardWriteText = jest.fn().mockResolvedValue(undefined);

let store: { display?: { contract: number; signaling: string } } = {};
const site = {
	url: 'https://example.com/shop',
	use_rest_route_param: true,
};

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
	View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
const mockPlatform = jest.requireMock<{ Platform: { OS: string } }>('react-native').Platform;
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <div>{children}</div> : null,
	AlertDialogAction: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) => (
		<button type="button" onClick={onPress}>
			{children}
		</button>
	),
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
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button type="button" data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<a data-testid={testID}>{children}</a>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
}));
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
jest.mock('../../../../services/customer-display', () => ({
	getCustomerDisplayService: () => mockCustomerDisplayService,
	isSupportedDisplayAdvertisement: (
		display: { contract?: unknown; signaling?: unknown } | undefined
	) =>
		display?.contract === 1 &&
		typeof display.signaling === 'string' &&
		display.signaling.startsWith('/wcpos/v2/'),
}));
jest.mock('../../pos/customer-display/customer-display-service-start', () => ({
	getCustomerDisplayServiceStartVersion: () => 1,
	subscribeCustomerDisplayServiceStart: () => jest.fn(),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ dateFnsLocale: undefined }),
}));
jest.mock('../components/settings-row', () => ({
	SettingsRow: ({
		children,
		label,
		description,
	}: React.PropsWithChildren<{ label: string; description?: string }>) => (
		<div>
			<span>{label}</span>
			<span>{description}</span>
			{children}
		</div>
	),
}));
jest.mock('../components/settings-section', () => ({
	SettingsSection: ({
		children,
		description,
	}: React.PropsWithChildren<{ description?: string }>) => (
		<section>
			<span>{description}</span>
			{children}
		</section>
	),
}));

describe('CustomerDisplaySettings', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, 'now').mockReturnValue(1788436800000);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: mockClipboardWriteText },
		});
		mockPlatform.OS = 'web';
		store = {};
	});
	afterEach(() => jest.restoreAllMocks());

	it('shows only the Pro explanation when customer displays are not advertised', () => {
		render(<CustomerDisplaySettings />);

		expect(screen.getByTestId('customer-display-not-advertised')).toBeInTheDocument();
		expect(screen.getByText('Customer displays are a Pro feature.')).toBeInTheDocument();
		expect(screen.getByTestId('customer-display-docs-link')).toBeInTheDocument();
		expect(screen.queryByTestId('customer-display-pair-button')).not.toBeInTheDocument();
		expect(screen.queryByTestId('customer-display-list')).not.toBeInTheDocument();
	});

	it.each([
		{ contract: 2, signaling: '/wcpos/v2/display' },
		{ contract: 1, signaling: '' },
		{ contract: 1, signaling: '/wp-json/display' },
	])('hides settings for unsupported advertisement %#', (display) => {
		store = { display };
		render(<CustomerDisplaySettings />);

		expect(screen.getByTestId('customer-display-not-advertised')).toBeInTheDocument();
		expect(screen.queryByTestId('customer-display-pair-button')).not.toBeInTheDocument();
	});

	it('renders service state and starts pairing when customer displays are advertised', () => {
		store = { display: { contract: 1, signaling: '/wcpos/v2/display' } };

		render(<CustomerDisplaySettings />);

		expect(screen.getByText('Counter screen')).toBeInTheDocument();
		expect(screen.getByText('Window screen')).toBeInTheDocument();
		expect(screen.getByTestId('customer-display-status-display-1')).toHaveTextContent('Connected');
		expect(screen.getByTestId('customer-display-status-display-2')).toHaveTextContent(
			'Disconnected'
		);
		expect(screen.getByText('Code expires in 10 minutes')).toBeInTheDocument();
		expect(screen.getByText('Last seen less than a minute ago')).toBeInTheDocument();
		expect(screen.getByText('Last seen never')).toBeInTheDocument();
		expect(screen.getByText('Displays paired with this device.')).toBeInTheDocument();
		expect(screen.getByTestId('customer-display-host-url')).toHaveTextContent(
			'https://example.com/shop/?wcpos-display=1'
		);

		fireEvent.click(screen.getByTestId('customer-display-pair-button'));

		expect(mintPairingCode).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getAllByRole('button', { name: 'Forget' })[0]);
		expect(
			screen.getByText(
				'Forget Counter screen? It will need to be paired again before it can show this device.'
			)
		).toBeInTheDocument();
	});

	it('copies the display URL on web and hides the copy action on native', () => {
		store = { display: { contract: 1, signaling: '/wcpos/v2/display' } };
		const { unmount } = render(<CustomerDisplaySettings />);

		fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }));
		expect(mockClipboardWriteText).toHaveBeenCalledWith(
			'https://example.com/shop/?wcpos-display=1'
		);

		unmount();
		mockPlatform.OS = 'ios';
		render(<CustomerDisplaySettings />);
		expect(screen.queryByRole('button', { name: 'Copy URL' })).not.toBeInTheDocument();
	});

	it('does nothing when the Clipboard API is unavailable', () => {
		store = { display: { contract: 1, signaling: '/wcpos/v2/display' } };
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
		render(<CustomerDisplaySettings />);

		expect(() => fireEvent.click(screen.getByRole('button', { name: 'Copy URL' }))).not.toThrow();
	});
});
