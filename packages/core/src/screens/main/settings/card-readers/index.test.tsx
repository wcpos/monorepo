/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import type { PaymentMethodDescriptor, ServerHardware } from '@wcpos/order-math';

import { CARD_READER_DOCS_URL } from './docs';
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
let mockProviderClose: (() => void) | undefined;
let mockMethods: PaymentMethodDescriptor[] = [];
let mockCaps = { canAcceptReaderTerms: true };
const mockPlatform = jest.requireMock('react-native').Platform;

jest.mock('@wcpos/components/property-row', () =>
	jest.requireActual('../../../../../jest/property-row.test-utils')
);
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
			OS: 'web',
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
const mockOpenExternalURL = jest.fn();
jest.mock('@wcpos/utils/open-external-url', () => ({
	openExternalURL: (...args: unknown[]) => mockOpenExternalURL(...args),
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
	DropdownMenuSeparator: () => <hr data-testid="menu-separator" />,
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
	AlertDialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').AlertDialogFooter,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
// The provider sheet renders inline while it is mounted.
jest.mock('@wcpos/components/portal', () => ({
	Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/dialog', () => ({
	DialogFooter: (props: import('@wcpos/components/dialog').DialogFooterProps) => {
		const Footer = jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter;
		const close = typeof props.close === 'object' ? props.close : {};
		return (
			<Footer
				{...props}
				close={
					props.close && {
						...close,
						onPress: (event: Parameters<NonNullable<typeof close.onPress>>[0]) => {
							close.onPress?.(event);
							mockProviderClose?.();
						},
					}
				}
			/>
		);
	},
	Dialog: ({ children, onClose }: React.PropsWithChildren<{ onClose?: () => void }>) => {
		mockProviderClose = onClose;
		return <>{children}</>;
	},
	DialogContent: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/badge', () => ({
	Badge: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	...jest.requireActual('@wcpos/components/text'),
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
	mockPlatform.OS = 'web';
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
	expect(screen.getByTestId('card-readers-none').textContent).toContain(
		"No card readers are set up for this store. Add them on the gateway's WooCommerce page."
	);
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
	// Remembered but disconnected: the state line says so (never blank), and the row offers
	// Connect and Forget; the release item only appears while the SDK still holds a reader.
	expect(screen.getByTestId(`${row}-line`).textContent).toBe('Not connected');
	expect(screen.queryByTestId(`${row}-release`)).toBeNull();
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
	// Help is a button in the row's action slot, still opening the reader docs.
	fireEvent.click(screen.getByTestId(`${row}-help`));
	expect(mockOpenExternalURL).toHaveBeenCalledWith(CARD_READER_DOCS_URL);
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

it('Forget keeps the reader when the SDK still holds it and will not let go', async () => {
	remembered$.next({
		[deviceMethod.id]: { id: 'sim-approve', label: 'Simulated approve', transport: 'bluetooth' },
	});
	const driver = createSimulatedDriver();
	const held: DriverStatus = {
		connection: 'connected',
		reader: { id: 'sim-approve', label: 'Simulated approve', transport: 'bluetooth' },
	};
	registerDriver({
		...driver,
		disconnect: async () => {
			throw new Error('SDK busy');
		},
		status$: { get: () => held, subscribe: () => () => {} },
	});
	render(<CardReadersSettings />);
	await flush();
	const row = `reader-row-${deviceMethod.id}`;
	fireEvent.click(screen.getByTestId(`${row}-forget`));
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-forget-confirm'));
	});
	expect(screen.getByTestId(`${row}-line`).textContent).toBe(
		'Could not forget the reader: SDK busy'
	);
	expect(remembered$.value[deviceMethod.id]?.id).toBe('sim-approve');
	expect(screen.getByTestId(`${row}-disconnect`)).toBeTruthy();
});

it('names the Terminal location when the gateway sends one', async () => {
	remembered$.next({
		[deviceMethod.id]: { id: 'sim-approve', label: 'Simulated approve', transport: 'bluetooth' },
	});
	mockMethods = [
		{ ...deviceMethod, provider_data: { location_id: 'tml_test', location_name: 'London Shop' } },
	];
	const named = render(<CardReadersSettings />);
	await flush();
	expect(screen.getByTestId(`reader-row-${deviceMethod.id}-identifiers`).textContent).toBe(
		'sim-approve · London Shop'
	);
	named.unmount();
	// An id alone is not cashier copy: no name, no line.
	mockMethods = [{ ...deviceMethod, provider_data: { location_id: 'tml_test' } }];
	render(<CardReadersSettings />);
	await flush();
	expect(screen.getByTestId(`reader-row-${deviceMethod.id}-identifiers`).textContent).toBe(
		'sim-approve'
	);
});

it('Cancel during a scan frees the row and drops the late result', async () => {
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const driver = createSimulatedDriver();
	registerDriver({
		...driver,
		discoverReaders: async (transport) => {
			await pending;
			return driver.discoverReaders!(transport);
		},
	});
	render(<CardReadersSettings />);
	await flush();
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-connect'));
	});
	const row = `reader-row-${deviceMethod.id}`;
	expect(screen.getByTestId(`${row}-line`).textContent).toContain('Looking for readers');
	await act(async () => {
		fireEvent.click(screen.getByTestId(`${row}-cancel-scan`));
	});
	// Nothing remembered, nothing connected, no scan: the empty state is back and the button is live.
	expect(screen.getByTestId('card-readers-empty')).toBeTruthy();
	expect((screen.getByTestId('card-readers-connect') as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		finish();
		await pending;
	});
	await flush();
	expect(screen.queryByTestId(`${row}-found`)).toBeNull();
	expect(screen.getByTestId('card-readers-empty')).toBeTruthy();
});

it.each([
	[null, 'default'],
	[{ id: 'solo', label: 'Solo Lite', serial: 'SU-1', transport: 'bluetooth' as const }, 'outline'],
])('Connect a reader is the primary only while no reader is held (%j)', (reader, variant) => {
	registerDriver(sdkUiDriver(reader));
	mockMethods = [deviceMethod, sumupMethod];
	render(<CardReadersSettings />);
	expect(screen.getByTestId('card-readers-connect').getAttribute('data-variant')).toBe(variant);
});

describe('a provider whose driver cannot run on this platform', () => {
	const stripeMethod: PaymentMethodDescriptor = {
		...deviceMethod,
		id: 'stripe',
		title: 'Stripe Terminal',
		capture: { ...deviceMethod.capture, provider: 'stripe-web-test' },
	};
	function stripeDriver(availability: ReturnType<PaymentDriver['availability']>): PaymentDriver {
		return {
			provider: 'stripe-web-test',
			capabilities: { discovery: 'harness', cancel: 'on_device', refund: false },
			availability: () => availability,
			collect: () => Promise.reject(new Error('not in this test')),
			status$: {
				get: () => ({ connection: 'disconnected', reader: null }),
				subscribe: () => () => {},
			},
		};
	}

	it('is not offered: Connect scans the one provider that can run, with no picker', async () => {
		registerDriver(stripeDriver({ available: false, reason: 'web' }));
		mockMethods = [deviceMethod, stripeMethod];
		render(<CardReadersSettings />);
		await flush();
		await act(async () => {
			fireEvent.click(screen.getByTestId('card-readers-connect'));
		});
		expect(screen.queryByTestId('card-readers-provider-sheet')).toBeNull();
		expect(screen.getByTestId(`reader-row-${deviceMethod.id}-connect-sim-approve`)).toBeTruthy();
		expect(screen.queryByTestId('reader-row-stripe')).toBeNull();
	});

	it('a store that allows only the app readers says so on web, not that none are set up', async () => {
		registerDriver(stripeDriver({ available: false, reason: 'web' }));
		mockMethods = [stripeMethod];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId('card-readers-app-only').textContent).toContain(
			"Only the app's readers are allowed for this store. Allow smart readers on the gateway's WooCommerce page to pay from this till."
		);
		expect(screen.queryByTestId('card-readers-none')).toBeNull();
	});

	it('is offered where it can run: two providers open the picker', async () => {
		registerDriver(stripeDriver({ available: true }));
		mockMethods = [deviceMethod, stripeMethod];
		render(<CardReadersSettings />);
		await flush();
		await act(async () => {
			fireEvent.click(screen.getByTestId('card-readers-connect'));
		});
		expect(screen.getByTestId('card-readers-provider-sheet')).toBeTruthy();
		expect(screen.getByTestId('card-readers-connect-stripe')).toBeTruthy();
		expect(screen.getByTestId(`card-readers-connect-${deviceMethod.id}`)).toBeTruthy();
	});
});

it('cancels provider selection without opening a reader connection', async () => {
	const driver = sdkUiDriver(null);
	registerDriver(driver);
	mockMethods = [deviceMethod, sumupMethod];
	render(<CardReadersSettings />);
	await flush();
	fireEvent.click(screen.getByTestId('card-readers-connect'));
	expect(screen.getByRole('radiogroup', { name: 'Connect a reader with' })).toBeTruthy();
	fireEvent.click(screen.getByTestId('card-readers-provider-cancel'));
	expect(screen.queryByTestId('card-readers-provider-sheet')).toBeNull();
	expect(screen.getByTestId('card-readers-connect')).toBeTruthy();
	expect(driver.opened).not.toHaveBeenCalled();
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
	// Two providers: Connect a reader opens a sheet offering each by name.
	expect(screen.queryByTestId('card-readers-provider-sheet')).toBeNull();
	fireEvent.click(screen.getByTestId('card-readers-connect'));
	expect(screen.getByTestId('card-readers-provider-sheet').textContent).toContain(
		'Connect a reader with'
	);
	expect(screen.getByTestId(`card-readers-connect-${deviceMethod.id}`)).toBeTruthy();
	await act(async () => {
		fireEvent.click(screen.getByTestId('card-readers-connect-sumup'));
	});
	// Picking a provider closes the sheet and starts that provider.
	expect(screen.queryByTestId('card-readers-provider-sheet')).toBeNull();
	expect(driver.opened).toHaveBeenCalledTimes(2);
});

it('keeps the action slot filled while connecting: a disabled Connecting… and the menu', async () => {
	const driver = createSimulatedDriver();
	let status: DriverStatus = { connection: 'disconnected', reader: null };
	const listeners = new Set<(s: DriverStatus) => void>();
	let finish!: () => void;
	registerDriver({
		...driver,
		connect: async (reader) => {
			status = { connection: 'connecting', reader };
			listeners.forEach((listener) => listener(status));
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
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
	const slot = screen.getByTestId(`${row}-connect`) as HTMLButtonElement;
	expect(slot.textContent).toBe('Connecting…');
	expect(slot.disabled).toBe(true);
	expect(screen.getByTestId(`${row}-menu`)).toBeTruthy();
	expect(screen.getByTestId(`${row}-line`).textContent).toContain('Connecting to');
	await act(async () => {
		finish();
	});
});

describe('Tap to Pay row', () => {
	// A real provider's name: the simulated provider gets no Tap to Pay row on a device.
	const stripeMethod: PaymentMethodDescriptor = {
		...deviceMethod,
		capture: { ...deviceMethod.capture, provider: 'stripe-test' },
	};
	beforeEach(() => {
		registerDriver({ ...createSimulatedDriver(), provider: 'stripe-test' });
		mockMethods = [stripeMethod];
	});

	it('is not offered for the simulated provider on a device', async () => {
		mockPlatform.OS = 'android';
		mockMethods = [deviceMethod];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}`)).toBeNull();
		expect(screen.queryByTestId('card-readers-this-phone')).toBeNull();
	});

	it('is native-only, admin-only for Set up, and scans the tap_to_pay transport', async () => {
		const web = render(<CardReadersSettings />);
		await flush();
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}`)).toBeNull();
		web.unmount();
		mockPlatform.OS = 'android';
		mockCaps = { canAcceptReaderTerms: false };
		const android = render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}`)).toBeTruthy();
		// Named for the platform: an Android phone never reads "on iPhone".
		expect(screen.getByText('Tap to Pay on Android')).toBeTruthy();
		android.unmount();
		mockPlatform.OS = 'ios';
		mockCaps = { canAcceptReaderTerms: false };
		const cashier = render(<CardReadersSettings />);
		await flush();
		// One meta line says both things; no second "Not set up" under it.
		expect(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}-line`).textContent).toBe(
			'Not set up · ask an administrator'
		);
		expect(screen.queryByText('Not set up')).toBeNull();
		expect(screen.queryByTestId(`tap-to-pay-row-${deviceMethod.id}-set-up`)).toBeNull();
		expect(screen.getByText('Tap to Pay on iPhone')).toBeTruthy();
		cashier.unmount();
		mockCaps = { canAcceptReaderTerms: true };
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}-line`).textContent).toBe(
			'Not set up'
		);
		expect(screen.getByTestId(`tap-to-pay-row-${deviceMethod.id}-set-up`).textContent).toBe(
			'Set up Tap to Pay'
		);
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

describe('Smart readers', () => {
	const cloudHardware: ServerHardware = {
		discovery: 'server',
		readers: [
			{ id: 'tmr_front', label: 'Front counter', status: 'online', default: true },
			{ id: 'tmr_back', label: 'Back counter', status: 'online', default: false },
			{ id: 'tmr_bar', label: 'Bar', status: 'offline', default: false },
		],
		default_reader: 'tmr_front',
		lock_to_default: false,
	};
	function cloud(hardware: Partial<ServerHardware> = {}, modes = true): PaymentMethodDescriptor {
		const entry = {
			mode: 'server',
			provider: 'stripe',
			hardware: { ...cloudHardware, ...hardware },
		};
		return {
			...deviceMethod,
			id: 'stripe_terminal',
			title: 'Stripe Terminal',
			capture: { ...entry, webview_available: false, ...(modes ? { modes: [entry] } : {}) },
			provider_data: { location_name: 'London Shop' },
		};
	}
	const row = (reader: string) => `smart-reader-stripe_terminal-${reader}`;

	it.each([
		['a capture.modes server entry', true],
		['a single-mode server descriptor', false],
	])('lists one row per cloud reader from %s, the default Selected', async (_label, modes) => {
		mockMethods = [cloud({}, modes)];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId('card-readers-smart').textContent).toContain('Smart readers');
		expect(screen.getByTestId(`${row('tmr_front')}-tag`).textContent).toBe('Stripe Terminal');
		expect(screen.getByTestId(`${row('tmr_front')}-identifiers`).textContent).toBe('London Shop');
		expect(screen.getByTestId(`${row('tmr_front')}-status`).textContent).toBe('Online');
		expect(screen.getByTestId(`${row('tmr_bar')}-status`).textContent).toBe('Offline');
		expect(screen.getByTestId(`${row('tmr_front')}-selected`).textContent).toBe('Selected');
		// A choice shown, not a button: no button role, no pressed state.
		expect(screen.getByTestId(`${row('tmr_front')}-selected`).getAttribute('role')).toBeNull();
		expect(
			screen.getByTestId(`${row('tmr_front')}-selected`).getAttribute('aria-pressed')
		).toBeNull();
		expect(screen.getByTestId(`${row('tmr_back')}-use`).textContent).toBe('Use this reader');
		// Cloud readers alone: no Bluetooth section and no empty page.
		expect(screen.queryByTestId('card-readers-list')).toBeNull();
		expect(screen.queryByTestId('card-readers-none')).toBeNull();
	});

	it('offers no Use on an offline reader', async () => {
		mockMethods = [cloud()];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.queryByTestId(`${row('tmr_bar')}-use`)).toBeNull();
		expect(screen.queryByTestId(`${row('tmr_bar')}-selected`)).toBeNull();
	});

	it('Use writes the till memory checkout reads, and the row becomes Selected', async () => {
		mockMethods = [cloud()];
		render(<CardReadersSettings />);
		await flush();
		await act(async () => {
			fireEvent.click(screen.getByTestId(`${row('tmr_back')}-use`));
		});
		expect(remembered$.value.stripe_terminal).toMatchObject({
			id: 'tmr_back',
			label: 'Back counter',
		});
		expect(remembered$.value.stripe_terminal?.transport).toBeUndefined();
		expect(screen.getByTestId(`${row('tmr_back')}-selected`)).toBeTruthy();
		expect(screen.queryByTestId(`${row('tmr_back')}-use`)).toBeNull();
		expect(screen.getByTestId(`${row('tmr_front')}-use`)).toBeTruthy();
	});

	it('a store lock shows only the default Selected, set by the store, and no Use', async () => {
		remembered$.next({ stripe_terminal: { id: 'tmr_front', label: 'Front counter' } });
		mockMethods = [cloud({ default_reader: 'tmr_back', lock_to_default: true })];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`${row('tmr_back')}-selected`)).toBeTruthy();
		expect(screen.getByTestId(`${row('tmr_back')}-identifiers`).textContent).toBe(
			'London Shop · Set by the store'
		);
		expect(screen.getByTestId(`${row('tmr_front')}-identifiers`).textContent).toBe('London Shop');
		expect(screen.queryAllByTestId(/-selected$/)).toHaveLength(1);
		expect(screen.queryAllByTestId(/^smart-reader-.*-use$/)).toHaveLength(0);
	});

	it('a store lock on an offline reader still says so, with nothing Selected and no Use', async () => {
		mockMethods = [cloud({ default_reader: 'tmr_bar', lock_to_default: true })];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`${row('tmr_bar')}-identifiers`).textContent).toBe(
			'London Shop · Set by the store'
		);
		expect(screen.queryAllByTestId(/^smart-reader-.*-(selected|use)$/)).toHaveLength(0);
	});

	it("the store's only reader needs no choice: Selected, and no Use anywhere", async () => {
		mockMethods = [
			cloud({
				readers: [{ id: 'tmr_back', label: 'Back counter', status: 'online', default: false }],
				default_reader: null,
			}),
		];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`${row('tmr_back')}-selected`)).toBeTruthy();
		expect(screen.queryAllByTestId(/^smart-reader-.*-use$/)).toHaveLength(0);
	});

	// Two readers with one offline is still a choice: the offline one may be this till's.
	it('one online reader beside an offline one is offered, not chosen', async () => {
		mockMethods = [
			cloud({
				readers: [
					{ id: 'tmr_back', label: 'Back counter', status: 'online', default: false },
					{ id: 'tmr_bar', label: 'Bar', status: 'offline', default: false },
				],
				default_reader: null,
			}),
		];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.queryAllByTestId(/^smart-reader-.*-selected$/)).toHaveLength(0);
		expect(screen.getByTestId(`${row('tmr_back')}-use`)).toBeTruthy();
		expect(screen.queryByTestId(`${row('tmr_bar')}-use`)).toBeNull();
	});

	it('a device-only store shows the Bluetooth section and no Smart readers', async () => {
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId('card-readers-list')).toBeTruthy();
		expect(screen.queryByTestId('card-readers-smart')).toBeNull();
	});

	const deviceEntry = {
		mode: 'device',
		provider: deviceMethod.capture.provider,
		hardware: deviceMethod.capture.hardware,
	};

	// Only the primary connection is a row; a secondary one becomes a row with wcpos/roadmap#113.
	it('a cloud-primary gateway that also allows a device shows Smart readers and no Bluetooth', async () => {
		const mixed = cloud();
		mockMethods = [
			{
				...mixed,
				capture: { ...mixed.capture, modes: [...(mixed.capture.modes ?? []), deviceEntry] },
			},
		];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId('card-readers-smart')).toBeTruthy();
		expect(screen.queryByTestId('card-readers-list')).toBeNull();
		expect(screen.queryByTestId('reader-row-stripe_terminal')).toBeNull();
	});

	// Only the primary connection is a row; a secondary one becomes a row with wcpos/roadmap#113.
	it('a device-primary gateway that also allows cloud readers shows no Smart readers', async () => {
		const server = cloud().capture.modes![0];
		mockMethods = [
			{ ...deviceMethod, capture: { ...deviceMethod.capture, modes: [deviceEntry, server] } },
		];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId('card-readers-list')).toBeTruthy();
		expect(screen.queryByTestId('card-readers-smart')).toBeNull();
	});

	it('a memory from the other connection is ignored on both sections', async () => {
		remembered$.next({
			// A device memory on the cloud method, a cloud memory on the device method.
			stripe_terminal: { id: 'tmr_back', label: 'Back counter', transport: 'bluetooth' },
			[deviceMethod.id]: { id: 'tmr_back', label: 'Back counter' },
		});
		mockMethods = [cloud(), deviceMethod];
		render(<CardReadersSettings />);
		await flush();
		expect(screen.getByTestId(`${row('tmr_front')}-selected`)).toBeTruthy();
		expect(screen.queryByTestId(`reader-row-${deviceMethod.id}`)).toBeNull();
		expect(screen.getByTestId('card-readers-empty')).toBeTruthy();
	});
});
