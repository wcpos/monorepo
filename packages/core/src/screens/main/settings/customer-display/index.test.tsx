/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CustomerDisplaySettings } from '.';

const createPairing = jest.fn();
const listDisplays = jest.fn();
const mockStoreSession = jest.fn();
const mockDisplayApi = { createPairing, listDisplays, forgetDisplay: jest.fn() };

jest.mock('../../display/use-display-api', () => ({
	useDisplayApi: () => mockDisplayApi,
}));
jest.mock('../../display/device-id', () => ({ getDeviceId: async () => 'device-1' }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => mockStoreSession(),
}));
jest.mock('../../hooks/use-date-format', () => ({ useDateFormat: () => '2 minutes ago' }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../jest/translate')>(
				'../../../../../jest/translate'
			)
			.createTestT(),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
	}: React.PropsWithChildren<{
		onPress?: () => void;
		testID?: string;
		disabled?: boolean;
	}>) => (
		<button data-testid={testID} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
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
		title,
		description,
	}: React.PropsWithChildren<{ title?: string; description?: string }>) => (
		<section>
			<h2>{title}</h2>
			<p>{description}</p>
			{children}
		</section>
	),
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogAction: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	AlertDialogCancel: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<button data-testid={testID}>{children}</button>
	),
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <>{children}</>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('CustomerDisplaySettings', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-09-03T12:00:00Z'));
		jest.clearAllMocks();
		mockStoreSession.mockReturnValue({
			store: { display: { contract: 1, signaling: '/wcpos/v2/display' } },
			site: { home: 'https://shop.example' },
		});
		listDisplays.mockResolvedValue([]);
		createPairing.mockResolvedValue({ code: '123456', expires_at: '2026-09-03T12:01:30Z' });
	});

	afterEach(() => jest.useRealTimers());

	it('renders a pairing code and countdown from the display API', async () => {
		const listResolvers: ((displays: never[]) => void)[] = [];
		listDisplays.mockImplementation(
			() => new Promise((resolve) => listResolvers.push(resolve as (displays: never[]) => void))
		);
		render(<CustomerDisplaySettings />);
		await act(async () => {
			listResolvers[0]([]);
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId('settings-customer-display-pair'));
			while (listResolvers.length < 2) await Promise.resolve();
			listResolvers[1]([]);
		});

		await waitFor(() =>
			expect(screen.getByTestId('settings-customer-display-code').textContent).toBe('123456')
		);
		expect(screen.getByTestId('settings-customer-display-countdown').textContent).toBe('01:30');
		act(() => jest.advanceTimersByTime(30_000));
		expect(screen.getByTestId('settings-customer-display-countdown').textContent).toBe('01:00');
	});

	it('renders nothing when the store does not advertise display signaling', () => {
		mockStoreSession.mockReturnValue({ store: {}, site: { home: 'https://shop.example' } });
		const { container } = render(<CustomerDisplaySettings />);
		expect(container.innerHTML).toBe('');
	});
});
