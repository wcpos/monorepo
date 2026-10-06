/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { CardReadersSettings } from './index';
import { method as deviceMethod } from '../../pos/checkout/payments/device/fixtures.test-utils';
import { registerDriver } from '../../../../services/payment-drivers/registry';
import { createSimulatedDriver } from '../../../../services/payment-drivers/simulated-driver';

import type { DriverStatus, PaymentDriver } from '../../../../services/payment-drivers/types';

type Remembered = Record<string, { id: string; label: string; transport?: string } | undefined>;
const remembered$ = new BehaviorSubject<Remembered>({});
const mockReaderState = {
	get: (path: string) => remembered$.value[path],
	get$: () => remembered$,
	set: async (path: string, modify: (value: unknown) => unknown) => {
		remembered$.next({ ...remembered$.value, [path]: modify(remembered$.value[path]) as never });
	},
};
const mockStoreDB = { addState: jest.fn(async () => mockReaderState) };
const mockBootstrap = jest.fn(async () => ({ token: 'connection' }));
let mockMethods: PaymentMethodDescriptor[] = [];
let mockCaps = { canAcceptReaderTerms: true };
let mockOS = 'web';

jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('../../hooks/use-payment-methods', () => ({
	usePaymentMethods: () => ({ methods: mockMethods }),
}));
jest.mock('../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: mockCaps, known: true }),
}));
jest.mock('../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => ({ bootstrap: mockBootstrap }),
}));
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		Platform: {
			...actual.Platform,
			get OS() {
				return mockOS;
			},
		},
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		disabled,
		onPress,
		variant,
	}: {
		children?: React.ReactNode;
		testID?: string;
		disabled?: boolean;
		onPress?: () => void;
		variant?: string;
	}) => (
		<button data-testid={testID} data-variant={variant} disabled={disabled} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID?: string; onPress?: () => void }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<a data-testid={testID}>{children}</a>
	),
}));
jest.mock('@wcpos/components/progress', () => ({
	Progress: ({ testID, value }: { testID?: string; value?: number }) => (
		<div data-testid={testID} data-value={value} />
	),
}));
// The menu renders its items inline so a test can press Forget without a portal.
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DropdownMenuItem: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{ testID?: string; onPress?: () => void }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <div data-testid="forget-dialog">{children}</div> : null,
	AlertDialogAction: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress?: () => void; testID?: string }>) => (
		<button data-testid={testID} onClick={onPress}>
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
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));

const sumupMethod: PaymentMethodDescriptor = {
	...deviceMethod,
	id: 'sumup',
	title: 'SumUp',
	capture: { ...deviceMethod.capture, provider: 'sumup-test' },
};

function sdkUiDriver(reader: DriverStatus['reader']): PaymentDriver & { opened: jest.Mock } {
	const status: DriverStatus = reader
		? { connection: 'connected', reader }
		: { connection: 'disconnected', reader: null };
	const opened = jest.fn(async () => {});
	return {
		provider: 'sumup-test',
		capabilities: { discovery: 'sdk_ui', cancel: 'on_device', refund: false },
		availability: () => ({ available: true }),
		openReaderSettings: opened,
		collect: () => Promise.reject(new Error('not in this test')),
		status$: { get: () => status, subscribe: () => () => {} },
		opened,
	};
}

beforeEach(() => {
	remembered$.next({});
	mockMethods = [deviceMethod];
	mockCaps = { canAcceptReaderTerms: true };
	mockOS = 'web';
	mockBootstrap.mockClear();
	registerDriver(createSimulatedDriver());
});

async function flush(ms = 0) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

it('explains an empty store and shows the dashed empty state when nothing is connected', async () => {
	mockMethods = [];
	const rendered = render(<CardReadersSettings />);
	expect(screen.getByTestId('card-readers-none')).toBeTruthy();
	rendered.unmount();
	mockMethods = [deviceMethod];
	render(<CardReadersSettings />);
	await flush();
	expect(screen.getByTestId('card-readers-empty')).toBeTruthy();
	expect(screen.queryByTestId(`reader-row-${deviceMethod.id}`)).toBeNull();
});

it('scans in place, connects with a bootstrap handoff, remembers, then disconnects and forgets', async () => {
	render(<CardReadersSettings />);
	await flush();
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-connect'));
	});
	const row = `reader-row-${deviceMethod.id}`;
	expect(screen.getByTestId(`${row}-line`).textContent).toContain('readers found');
	expect(screen.getByTestId(`${row}-connect-sim-tip`)).toBeTruthy();
	// Bluetooth is the default scan; the Tap to Pay simulator stays out of the list.
	expect(screen.queryByTestId(`${row}-connect-sim-tap`)).toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-connect-sim-approve`));
	});
	await flush(350);
	expect(mockBootstrap).toHaveBeenCalledWith(deviceMethod.id, { transport: 'bluetooth' });
	expect(screen.getByTestId(`${row}-status`).textContent).toBe('Connected · 82%');
	expect(remembered$.value[deviceMethod.id]?.id).toBe('sim-approve');
	expect(screen.queryByTestId(`${row}-found`)).toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-disconnect`));
	});
	expect(screen.queryByTestId(`${row}-status`)).toBeNull();
	// Remembered but disconnected: the row stays, says so, and offers Connect and Forget.
	expect(screen.getByTestId(`${row}-line`).textContent).toBe('Not connected');
	expect(screen.getByTestId(`${row}-connect`)).toBeTruthy();
	fireEvent.click(screen.getByTestId(`${row}-forget`));
	// The row and the dialog name the model, as the box does; the label is the SDK's.
	expect(screen.getByTestId('forget-dialog').textContent).toContain('Forget Simulated reader?');
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-forget-confirm'));
	});
	expect(remembered$.value[deviceMethod.id]).toBeUndefined();
	expect(screen.getByTestId('card-readers-empty')).toBeTruthy();
});

it('shows a failed connect as one line with Try again, and the update progress as a bar', async () => {
	const driver = createSimulatedDriver();
	let status: DriverStatus = { connection: 'disconnected', reader: null };
	const listeners = new Set<(s: DriverStatus) => void>();
	const publish = (next: DriverStatus) =>
		act(() => {
			status = next;
			listeners.forEach((listener) => listener(status));
		});
	registerDriver({
		...driver,
		connect: async () => {
			throw new Error('not supported at this location');
		},
		status$: {
			get: () => status,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
	});
	render(<CardReadersSettings />);
	await flush();
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-connect'));
	});
	const row = `reader-row-${deviceMethod.id}`;
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-connect-sim-approve`));
	});
	expect(screen.getByTestId(`${row}-line`).textContent).toBe(
		'Could not connect: not supported at this location'
	);
	expect(screen.getByTestId(`${row}-retry`)).toBeTruthy();
	expect(screen.getByTestId(`${row}-help`)).toBeTruthy();
	// The list went with the choice; the error is the row's one line.
	expect(screen.queryByTestId(`${row}-found`)).toBeNull();
	// Try again scans afresh and clears the error.
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-retry`));
	});
	expect(screen.getByTestId(`${row}-found`)).toBeTruthy();
	expect(screen.getByTestId(`${row}-line`).textContent).toContain('readers found');
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-cancel-scan`));
	});
	publish({
		connection: 'updating',
		progress: 0.46,
		reader: { id: 'sim-approve', label: 'Simulated approve', transport: 'bluetooth' },
	});
	expect(screen.getByTestId(`${row}-progress`).getAttribute('data-value')).toBe('46');
	expect(screen.getByTestId(`${row}-line`).textContent).toBe('Installing reader software');
	expect(screen.queryByTestId(`${row}-retry`)).toBeNull();
});

it("a provider whose SDK owns pairing gets one button that opens the provider's screen", async () => {
	const driver = sdkUiDriver({
		id: 'solo',
		label: 'Solo Lite',
		serial: 'SU-1',
		transport: 'bluetooth',
	});
	registerDriver(driver);
	mockMethods = [deviceMethod, sumupMethod];
	render(<CardReadersSettings />);
	await flush();
	// The SDK reports a saved reader as connected; the row has no Disconnect of its own.
	expect(screen.getByTestId('reader-row-sumup-status').textContent).toBe('Connected');
	expect(screen.queryByTestId('reader-row-sumup-disconnect')).toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByTestId('reader-row-sumup-open-sdk'));
	});
	expect(driver.opened).toHaveBeenCalledTimes(1);
	// Two providers: Connect a reader offers each by name.
	expect(screen.getByTestId(`card-readers-connect-${deviceMethod.id}`)).toBeTruthy();
	expect(screen.getByTestId('card-readers-connect-sumup')).toBeTruthy();
});

describe('Tap to Pay row', () => {
	it('is iOS-only, admin-only for Set up, and scans the tap_to_pay transport', async () => {
		const web = render(<CardReadersSettings />);
		await flush();
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}`)).toBeNull();
		web.unmount();
		mockOS = 'ios';
		mockCaps = { canAcceptReaderTerms: false };
		const cashier = render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}-line`).textContent).toBe(
			'Ask an administrator to set this up'
		);
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}-set-up`)).toBeNull();
		cashier.unmount();
		mockCaps = { canAcceptReaderTerms: true };
		render(<CardReadersSettings />);
		await flush();
		await act(async () => {
			fireEvent.click(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}-set-up`));
		});
		// The simulator's Tap to Pay reader is the only tap_to_pay candidate.
		expect(screen.getByTestId(`reader-row-${deviceMethod.id}-connect-sim-tap`)).toBeTruthy();
		expect(screen.queryByTestId(`reader-row-${deviceMethod.id}-connect-sim-approve`)).toBeNull();
		await act(async () => {
			fireEvent.click(screen.getByTestId(`reader-row-${deviceMethod.id}-connect-sim-tap`));
		});
		await flush(350);
		expect(mockBootstrap).toHaveBeenCalledWith(deviceMethod.id, { transport: 'tap_to_pay' });
		// Once connected the phone is the reader row and the offer row is gone.
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}`)).toBeNull();
		expect(screen.getByTestId(`reader-row-${deviceMethod.id}-status`).textContent).toBe(
			'Ready · 82%'
		);
	});
});
