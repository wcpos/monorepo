import * as React from 'react';
import { AppState, type AppStateStatus, PermissionsAndroid, Platform } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
	requestNeededAndroidPermissions,
	StripeTerminalProvider,
	useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';

import {
	method,
	row,
} from '@wcpos/core/screens/main/pos/checkout/payments/device/fixtures.test-utils';
import { usePaymentMethods } from '@wcpos/core/screens/main/hooks/use-payment-methods';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { getDriver } from '@wcpos/core/services/payment-drivers/registry';
import type { CollectInput } from '@wcpos/core/services/payment-drivers/types';

import { StripeTerminalDriverRegistration } from '../../payment-drivers';
import { StripeTerminalDriverBridge } from './bridge';
import { createStripeTerminalDriver, type Sdk, tokenProvider } from './driver';
import { createStripeTerminalDriver as createWebDriver } from './driver.web';

// Match the app's Jest setup: clear Expo winter-runtime lazy globals at module scope.
jest.resetModules();

jest.mock(
	'@stripe/stripe-terminal-react-native',
	() => ({
		StripeTerminalProvider: jest.fn(({ children }) => children),
		useStripeTerminal: jest.fn(),
		requestNeededAndroidPermissions: jest.fn(),
	}),
	{ virtual: true }
);

jest.mock('@wcpos/core/screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: jest.fn(),
}));
jest.mock('@wcpos/core/screens/main/hooks/use-payment-methods', () => ({
	usePaymentMethods: jest.fn(),
}));
jest.mock('@wcpos/utils/logger', () => ({ log: { warn: jest.fn() } }));

const reader = { id: 'tmr_1', serialNumber: 'R1', deviceType: 'stripeM2', batteryLevel: 0.8 };
const info = {
	id: 'R1',
	label: 'stripeM2 R1',
	model: 'stripeM2',
	serial: 'R1',
	battery: 80,
	transport: 'bluetooth' as const,
};
const pi = {
	id: 'pi_confirmed',
	amount: 1125,
	status: 'succeeded',
	metadata: { wcpos_payment_id: 'leg' },
	charges: [
		{
			id: 'ch_confirmed',
			paymentMethodDetails: {
				cardPresentDetails: { brand: 'visa', last4: '4242', funding: 'credit' },
			},
		},
	],
	offlineDetails: { id: 'offline_1' },
};
const input: CollectInput = {
	dp: 2,
	row,
	method,
	transport: 'bluetooth',
	handoff: { client_secret: 'secret' },
	offline: false,
	tipEligibleMinor: 1000,
};
const handoff = { method_id: 'stripe_method', location_id: 'tml_1' };
function sdkMock() {
	return {
		initialize: jest.fn().mockResolvedValue({}),
		discoverReaders: jest.fn().mockResolvedValue({}),
		cancelDiscovering: jest.fn().mockResolvedValue({}),
		connectReader: jest.fn().mockResolvedValue({ reader }),
		disconnectReader: jest.fn().mockResolvedValue({}),
		retrievePaymentIntent: jest
			.fn()
			.mockResolvedValue({ paymentIntent: { ...pi, id: 'pi_retrieved' } }),
		createPaymentIntent: jest.fn().mockResolvedValue({ paymentIntent: { ...pi, id: undefined } }),
		collectPaymentMethod: jest
			.fn()
			.mockResolvedValue({ paymentIntent: { ...pi, id: 'pi_collected' } }),
		confirmPaymentIntent: jest.fn().mockResolvedValue({ paymentIntent: pi }),
		cancelCollectPaymentMethod: jest.fn().mockResolvedValue({}),
		setSimulatedCard: jest.fn(),
		setSimulatedOfflineMode: jest.fn(),
		getConnectionStatus: jest.fn(),
		getConnectedReader: jest.fn(),
		discoveredReaders: [],
		connectedReader: undefined,
		isInitialized: true,
	};
}
let api: ReturnType<typeof sdkMock>;
let driver: ReturnType<typeof createStripeTerminalDriver>;
let bootstrap: jest.Mock;
let resolveMethod: jest.Mock<CollectInput['method'] | null, []>;
const rawReader = reader as Parameters<
	typeof driver.callbacks.onUpdateDiscoveredReaders
>[0][number];
const rawPi = pi as unknown as Parameters<typeof driver.callbacks.onDidForwardPaymentIntent>[0];
beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	jest.spyOn(console, 'log').mockImplementation(() => {});
	api = sdkMock();
	bootstrap = jest.fn().mockResolvedValue({ connection_token: 'fresh' });
	resolveMethod = jest.fn().mockReturnValue({ ...method, id: 'resolved_method' });
	driver = createStripeTerminalDriver({ bootstrap, resolveMethod });
	driver.bindSdk(api as unknown as Sdk);
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.clearAllTimers();
	jest.useRealTimers();
});
async function discover(transport: CollectInput['transport'] = 'bluetooth') {
	const pending = driver.discoverReaders(transport);
	await jest.advanceTimersByTimeAsync(0);
	driver.callbacks.onUpdateDiscoveredReaders([rawReader]);
	driver.callbacks.onFinishDiscoveringReaders();
	return pending;
}
it('bootstraps before SDK binding and uses the current resolver on each token request', async () => {
	driver = createStripeTerminalDriver({ bootstrap, resolveMethod });
	await expect(tokenProvider()).resolves.toBe('fresh');
	expect(bootstrap).toHaveBeenLastCalledWith('resolved_method');
	resolveMethod.mockReturnValue({ ...method, id: 'updated_method' });
	await tokenProvider();
	expect(bootstrap).toHaveBeenLastCalledWith('updated_method');
	resolveMethod.mockReturnValue(null);
	await expect(tokenProvider()).rejects.toThrow('Stripe Terminal is not enabled on this store');
	expect(bootstrap).toHaveBeenCalledTimes(2);
});
it('connects without a token and uses the handoff method hint until cleared', async () => {
	await discover();
	await driver.connect(info, handoff);
	await expect(tokenProvider()).resolves.toBe('fresh');
	expect(bootstrap).toHaveBeenLastCalledWith('stripe_method');
	await driver.connect(info, { ...handoff, method_id: 'other', connection_token: 'ignored' });
	await expect(tokenProvider()).resolves.toBe('fresh');
	expect(bootstrap).toHaveBeenLastCalledWith('other');
	await driver.connect(info, { location_id: 'tml_1' });
	await tokenProvider();
	expect(bootstrap).toHaveBeenLastCalledWith('resolved_method');
});
it('maps discovery callbacks and cancels before discovering and connecting', async () => {
	await expect(discover()).resolves.toEqual([info]);
	expect(api.discoverReaders).toHaveBeenCalledWith({
		discoveryMethod: 'bluetoothScan',
		simulated: false,
	});
	await driver.connect(info, handoff);
	expect(api.connectReader).toHaveBeenCalledWith({
		discoveryMethod: 'bluetoothScan',
		reader,
		locationId: 'tml_1',
		autoReconnectOnUnexpectedDisconnect: true,
	});
	expect(api.cancelDiscovering).toHaveBeenCalledTimes(2);
	expect(driver.status$.get()).toMatchObject({ connection: 'connected', reader: info });
});
it.each([
	{ batteryLevel: 0.85, battery: 85 },
	{ batteryLevel: 0.856, battery: 86 },
	{ batteryLevel: null, battery: null },
])('maps SDK battery $batteryLevel to percentage $battery', async ({ batteryLevel, battery }) => {
	const pending = driver.discoverReaders('bluetooth');
	await jest.advanceTimersByTimeAsync(0);
	// Exercise runtime null handling even though the SDK type only allows number | undefined.
	const sdkReader = { ...rawReader, batteryLevel } as unknown as typeof rawReader;
	driver.callbacks.onUpdateDiscoveredReaders([sdkReader]);
	driver.callbacks.onFinishDiscoveringReaders();
	await expect(pending).resolves.toEqual([{ ...info, battery }]);
});
it.each([true, false])(
	'disconnects before scanning only when connected (connected=%s)',
	async (connected) => {
		if (connected) {
			await discover();
			await driver.connect(info, handoff);
		}
		api.discoverReaders.mockClear();
		const listener = jest.fn();
		const unsubscribe = driver.status$.subscribe(listener);
		try {
			let finishDisconnect!: (result: object) => void;
			api.disconnectReader.mockImplementationOnce(
				() => new Promise((resolve) => (finishDisconnect = resolve))
			);
			const pending = driver.discoverReaders('bluetooth');
			await jest.advanceTimersByTimeAsync(0);
			if (connected) {
				expect(api.disconnectReader).toHaveBeenCalledTimes(1);
				expect(api.discoverReaders).not.toHaveBeenCalled();
				expect(driver.status$.get().connection).toBe('connected');
				finishDisconnect({});
				await jest.advanceTimersByTimeAsync(0);
				expect(listener).toHaveBeenNthCalledWith(
					1,
					expect.objectContaining({ connection: 'disconnected', reader: null })
				);
				expect(listener.mock.invocationCallOrder[0]).toBeLessThan(
					api.discoverReaders.mock.invocationCallOrder[0]
				);
			} else {
				expect(api.disconnectReader).not.toHaveBeenCalled();
			}
			expect(api.discoverReaders).toHaveBeenCalledTimes(1);
			expect(driver.status$.get()).toMatchObject({ connection: 'discovering', reader: null });
			driver.callbacks.onFinishDiscoveringReaders();
			await expect(pending).resolves.toEqual([]);
		} finally {
			unsubscribe();
		}
	}
);
it('returns the latest discovered readers after ten seconds without a finish callback', async () => {
	const pending = driver.discoverReaders('tap_to_pay');
	await jest.advanceTimersByTimeAsync(0);
	driver.callbacks.onUpdateDiscoveredReaders([rawReader]);
	await jest.advanceTimersByTimeAsync(10000);
	await expect(pending).resolves.toEqual([{ ...info, transport: 'tap_to_pay' }]);
	expect(api.cancelDiscovering).toHaveBeenCalledTimes(2);
});
it('requires a location before calling the SDK', async () => {
	await expect(driver.connect(info, { method_id: 'method' })).rejects.toThrow(
		'This gateway has no Terminal location'
	);
	expect(api.connectReader).not.toHaveBeenCalled();
});
it('rejects after ten seconds if the bridge is not ready', async () => {
	driver.bindSdk(null);
	const rejected = expect(driver.collect(input)).rejects.toThrow('Stripe Terminal is not ready');
	await jest.advanceTimersByTimeAsync(10000);
	await rejected;
});
it('waits for a late SDK binding', async () => {
	driver.bindSdk(null);
	const pending = driver.cancel();
	expect(api.cancelCollectPaymentMethod).not.toHaveBeenCalled();
	driver.bindSdk(api as unknown as Sdk);
	await pending;
	expect(api.cancelCollectPaymentMethod).toHaveBeenCalledTimes(1);
});
it('publishes update, battery, input, reconnect, disconnect and pairing status', async () => {
	await discover();
	await driver.connect(info, handoff);
	const listener = jest.fn();
	const unsubscribe = driver.status$.subscribe(listener);
	driver.callbacks.onDidChangeConnectionStatus('connecting');
	expect(driver.status$.get().connection).toBe('connecting');
	driver.callbacks.onDidStartInstallingUpdate();
	driver.callbacks.onDidReportReaderSoftwareUpdateProgress('45%');
	expect(driver.status$.get()).toMatchObject({ connection: 'updating', progress: 0.45 });
	driver.callbacks.onDidFinishInstallingUpdate({});
	driver.callbacks.onDidChangeConnectionStatus('connected');
	driver.callbacks.onDidUpdateBatteryLevel({
		batteryLevel: 0.5,
		batteryStatus: 'nominal',
		isCharging: false,
	});
	expect(driver.status$.get()).toMatchObject({ connection: 'connected', reader: { battery: 50 } });
	driver.callbacks.onDidRequestReaderDisplayMessage('insertCard');
	expect(driver.status$.get().message).toBe('insertCard');
	driver.callbacks.onDidRequestReaderInput(['tapCard']);
	expect(driver.status$.get().message).toBe('tapCard');
	driver.callbacks.onDidRequestReaderPairingCode('123456');
	expect(driver.status$.get().pairingCode).toBe('123456');
	driver.callbacks.onDidStartReaderReconnect(rawReader);
	expect(driver.status$.get()).toMatchObject({
		connection: 'connecting',
		message: expect.stringMatching(/reconnect/i),
	});
	driver.callbacks.onDidSucceedReaderReconnect(rawReader);
	expect(driver.status$.get().connection).toBe('connected');
	driver.callbacks.onDidFailReaderReconnect();
	expect(driver.status$.get().connection).toBe('disconnected');
	driver.callbacks.onDidDisconnect('poweredOff');
	expect(driver.status$.get().reader).toBeNull();
	unsubscribe();
	listener.mockClear();
	driver.callbacks.onDidRequestReaderDisplayMessage('removeCard');
	expect(listener).not.toHaveBeenCalled();
});
it('returns only the confirmed online intent, charge, receipt and amount', async () => {
	await expect(driver.collect(input)).resolves.toEqual({
		outcome: 'captured',
		provider_refs: { payment_intent: 'pi_confirmed', charge: 'ch_confirmed' },
		receipt: { brand: 'visa', last4: '4242', funding: 'credit' },
		amount: '11.25',
		transport: 'bluetooth',
	});
	expect(api.retrievePaymentIntent).toHaveBeenCalledWith('secret');
	expect(api.collectPaymentMethod).toHaveBeenCalledWith({
		paymentIntent: { ...pi, id: 'pi_retrieved' },
		tipEligibleAmount: undefined,
		skipTipping: true,
	});
	expect(api.confirmPaymentIntent).toHaveBeenCalledWith({
		paymentIntent: { ...pi, id: 'pi_collected' },
	});
});
it.each([
	{ deviceType: 'wisePad3', tipEligibleAmount: 1000, skipTipping: false },
	{ deviceType: 'chipper2X', tipEligibleAmount: undefined, skipTipping: true },
])(
	'configures on-reader tipping for $deviceType',
	async ({ deviceType, tipEligibleAmount, skipTipping }) => {
		await discover();
		api.connectReader.mockResolvedValueOnce({ reader: { ...reader, deviceType } });
		await driver.connect(info, handoff);
		expect(driver.status$.get().reader?.model).toBe(deviceType);
		await driver.collect(input);
		expect(api.collectPaymentMethod).toHaveBeenCalledWith({
			paymentIntent: { ...pi, id: 'pi_retrieved' },
			tipEligibleAmount,
			skipTipping,
		});
	}
);
it.each(['retrievePaymentIntent', 'collectPaymentMethod', 'confirmPaymentIntent'] as const)(
	'maps Canceled from %s',
	async (operation) => {
		api[operation].mockResolvedValue({ error: { code: 'Canceled', message: 'cancelled' } });
		await expect(driver.collect(input)).resolves.toMatchObject({
			outcome: 'cancelled',
			provider_refs: {},
			amount: null,
		});
	}
);
it.each([
	{ code: 'DeclinedByStripeAPI', declineCode: 'insufficient_funds' },
	{ code: 'DeclinedByStripeAPI' },
	{ code: 'DeclinedByStripeAPI', apiError: { declineCode: 'expired_card' } },
])('maps a confirmation decline: %j', async (error) => {
	api.confirmPaymentIntent.mockResolvedValue({ error: { ...error, message: 'declined' } });
	await expect(driver.collect(input)).resolves.toMatchObject({
		outcome: 'declined',
		failure_reason: error.declineCode ?? error.apiError?.declineCode ?? 'card_declined',
	});
});
it('rejects SDK and unexpected thrown errors instead of inventing outcomes', async () => {
	api.confirmPaymentIntent.mockResolvedValueOnce({
		error: { code: 'NetworkError', message: 'network unavailable' },
	});
	await expect(driver.collect(input)).rejects.toThrow('network unavailable');
	api.confirmPaymentIntent.mockRejectedValueOnce(new Error('native failure'));
	await expect(driver.collect(input)).rejects.toThrow('native failure');
	api.confirmPaymentIntent.mockResolvedValueOnce({});
	await expect(driver.collect(input)).rejects.toThrow('payment intent');
});
it('forces offline authorization and settles only a successfully forwarded row', async () => {
	const settled = jest.fn();
	const unsubscribe = driver.settleOffline$.subscribe(settled);
	await expect(
		driver.collect({ ...input, offline: true, tipEligibleMinor: null })
	).resolves.toMatchObject({
		outcome: 'authorized',
		amount: '10.00',
		provider_refs: { payment_intent: null },
	});
	expect((await driver.collect({ ...input, offline: true })).provider_refs).toEqual({
		payment_intent: null,
	});
	expect(api.createPaymentIntent).toHaveBeenCalledWith({
		amount: 1000,
		currency: 'usd',
		captureMethod: 'automatic',
		offlineBehavior: 'force_offline',
		metadata: { wcpos_payment_id: 'leg' },
	});
	expect(api.retrievePaymentIntent).not.toHaveBeenCalled();
	expect(api.collectPaymentMethod).toHaveBeenCalledWith({
		paymentIntent: { ...pi, id: undefined },
		tipEligibleAmount: undefined,
		skipTipping: true,
	});
	driver.callbacks.onDidForwardPaymentIntent(rawPi, {
		code: 'NetworkError',
		message: 'not forwarded',
	});
	expect(settled).not.toHaveBeenCalled();
	driver.callbacks.onDidForwardPaymentIntent(rawPi);
	expect(settled).toHaveBeenCalledWith({
		rowId: 'leg',
		provider_refs: { payment_intent: 'pi_confirmed', charge: 'ch_confirmed' },
	});
	driver.callbacks.onDidForwardingFailure({ code: 'NetworkError', message: 'forward failed' });
	expect(driver.status$.get().message).toBe('forward failed');
	unsubscribe();
});
it('falls back to the collected descriptor when unresolved, never the connect handoff', async () => {
	resolveMethod.mockReturnValue(null);
	await discover();
	await driver.connect(info, { ...handoff, test_mode: true });
	await discover('tap_to_pay');
	expect(api.discoverReaders).toHaveBeenLastCalledWith({
		discoveryMethod: 'tapToPay',
		simulated: false,
	});
	await driver.connect({ ...info, transport: 'tap_to_pay' }, handoff);
	expect(api.connectReader).toHaveBeenLastCalledWith({
		discoveryMethod: 'tapToPay',
		reader,
		locationId: 'tml_1',
	});
	await driver.collect({ ...input, method: { ...method, provider_data: { test_mode: true } } });
	await discover();
	expect(api.discoverReaders).toHaveBeenLastCalledWith({
		discoveryMethod: 'bluetoothScan',
		simulated: true,
	});
});
it('reports Bluetooth errors and recovers availability on connection', async () => {
	await discover();
	api.connectReader.mockResolvedValueOnce({
		error: { code: 'BluetoothDisabled', message: 'Turn on Bluetooth' },
	});
	await expect(driver.connect(info, handoff)).rejects.toThrow('Turn on Bluetooth');
	expect(driver.availability()).toEqual({ available: false, reason: 'bluetooth_off' });
	await driver.connect(info, handoff);
	expect(driver.availability()).toEqual({ available: true });
});
it('rejects all web driver operations', async () => {
	const web = createWebDriver({ bootstrap, resolveMethod });
	expect(web.availability()).toEqual({ available: false, reason: 'web' });
	await expect(web.collect(input)).rejects.toThrow();
	await expect(web.connect!(info, handoff)).rejects.toThrow();
	await expect(web.discoverReaders!('bluetooth')).rejects.toThrow();
	await expect(web.cancel!()).rejects.toThrow();
	await expect(web.disconnect!()).rejects.toThrow();
});
it.each([true, false])(
	'requests Android permissions before initializing (granted=%s)',
	async (granted) => {
		const os = Platform.OS;
		Platform.OS = 'android';
		jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
		jest.mocked(requestNeededAndroidPermissions).mockResolvedValue({
			error: granted ? null : { 'android.permission.ACCESS_FINE_LOCATION': 'denied' },
		});
		jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
		driver.bindSdk(null);
		let tree!: ReactTestRenderer;
		try {
			await act(async () => {
				tree = create(<StripeTerminalDriverBridge driver={driver} />);
			});
			expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(1);
			if (granted) {
				expect(api.initialize).toHaveBeenCalledTimes(1);
				expect(
					jest.mocked(requestNeededAndroidPermissions).mock.invocationCallOrder[0]
				).toBeLessThan(api.initialize.mock.invocationCallOrder[0]);
			} else {
				expect(api.initialize).not.toHaveBeenCalled();
				expect(driver.availability()).toEqual({ available: false, reason: 'permission' });
			}
			await act(async () => {
				tree.update(<StripeTerminalDriverBridge driver={driver} />);
			});
			expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(1);
			for (const [props] of jest.mocked(StripeTerminalProvider).mock.calls)
				expect(props.tokenProvider).toBe(tokenProvider);
		} finally {
			await act(async () => tree?.unmount());
			Platform.OS = os;
		}
	}
);

it('defers initialization until a Stripe device descriptor exists and bootstraps at init', async () => {
	const os = Platform.OS;
	Platform.OS = 'ios';
	const post = jest
		.fn()
		.mockResolvedValue({ data: { handoff: { connection_token: 'rest_token' } } });
	jest
		.mocked(useRestHttpClient)
		.mockReturnValue({ post } as unknown as ReturnType<typeof useRestHttpClient>);
	jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
	const descriptors = (methods: ReturnType<typeof usePaymentMethods>['methods']) =>
		jest.mocked(usePaymentMethods).mockReturnValue({
			methods,
			byId: new Map(methods.map((item) => [item.id, item])),
			contract: 'test',
			loaded: true,
			unsupportedSchema: false,
		});
	descriptors([]);
	api.initialize.mockImplementation(async () => {
		expect(await tokenProvider()).toBe('rest_token');
		return {};
	});
	let tree!: ReactTestRenderer;
	try {
		await act(async () => {
			tree = create(<StripeTerminalDriverRegistration />);
		});
		expect(api.initialize).not.toHaveBeenCalled();
		expect(post).not.toHaveBeenCalled();
		descriptors([
			{ ...method, capture: { ...method.capture, mode: 'device', provider: 'not-stripe' } },
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		expect(api.initialize).not.toHaveBeenCalled();
		descriptors([
			{ ...method, capture: { ...method.capture, mode: 'server', provider: 'stripe' } },
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		expect(api.initialize).not.toHaveBeenCalled();
		descriptors([
			{
				...method,
				pos_enabled: false,
				capture: { ...method.capture, mode: 'device', provider: 'stripe' },
			},
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		expect(api.initialize).not.toHaveBeenCalled();
		await expect(tokenProvider()).rejects.toThrow('not enabled');
		descriptors([
			{
				...method,
				id: 'store_stripe',
				capture: { ...method.capture, mode: 'device', provider: 'stripe' },
			},
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		expect(api.initialize).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenLastCalledWith('payment-methods/store_stripe/bootstrap', {});
		const registered = getDriver('stripe')!;
		descriptors([
			{
				...method,
				id: 'new_stripe',
				provider_data: { test_mode: true },
				capture: { ...method.capture, mode: 'device', provider: 'stripe' },
			},
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		await tokenProvider();
		expect(post).toHaveBeenLastCalledWith('payment-methods/new_stripe/bootstrap', {});
		expect(api.initialize).toHaveBeenCalledTimes(1);
		const callbacks = jest.mocked(useStripeTerminal).mock.calls.at(-1)![0]!;
		const pending = registered.discoverReaders!('bluetooth');
		await jest.advanceTimersByTimeAsync(0);
		expect(api.discoverReaders).toHaveBeenLastCalledWith({
			discoveryMethod: 'bluetoothScan',
			simulated: true,
		});
		callbacks.onUpdateDiscoveredReaders!([rawReader]);
		callbacks.onFinishDiscoveringReaders!();
		await pending;
		await registered.connect!(info, handoff);
		await expect(tokenProvider()).resolves.toBe('rest_token');
		expect(post).toHaveBeenCalledWith('payment-methods/stripe_method/bootstrap', {});
		await act(async () => {
			tree.update(<StripeTerminalDriverRegistration />);
		});
		expect(getDriver('stripe')).toBe(registered);
		descriptors([]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		await expect(tokenProvider()).rejects.toThrow('Stripe Terminal is not enabled on this store');
		descriptors([
			{
				...method,
				id: 'reenabled',
				capture: { ...method.capture, mode: 'device', provider: 'stripe' },
			},
		]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
		expect(api.initialize).toHaveBeenCalledTimes(2);
		expect(post).toHaveBeenLastCalledWith('payment-methods/reenabled/bootstrap', {});
	} finally {
		await act(async () => tree?.unmount());
		Platform.OS = os;
	}
});

it.each(['CancelFailedAlreadyCompleted', 'CANCEL_FAILED'])(
	'allows idle %s cancellation but rejects a real discovery error',
	async (code) => {
		api.cancelDiscovering.mockResolvedValueOnce({ error: { code, message: 'already completed' } });
		await expect(discover()).resolves.toEqual([info]);
		api.discoverReaders.mockResolvedValueOnce({
			error: { code: 'BluetoothDisabled', message: 'Bluetooth is off' },
		});
		await expect(driver.discoverReaders('bluetooth')).rejects.toThrow('Bluetooth is off');
		expect(driver.availability()).toEqual({ available: false, reason: 'bluetooth_off' });
	}
);

it.each(['success', 'generic', 'bluetooth'])(
	'clears a previous Bluetooth discovery failure before a %s retry',
	async (outcome) => {
		api.discoverReaders.mockResolvedValueOnce({
			error: { code: 'BluetoothDisabled', message: 'Bluetooth is off' },
		});
		await expect(driver.discoverReaders('bluetooth')).rejects.toThrow('Bluetooth is off');
		expect(driver.availability()).toEqual({ available: false, reason: 'bluetooth_off' });
		const pending = driver.discoverReaders('bluetooth');
		await jest.advanceTimersByTimeAsync(0);
		expect(driver.status$.get()).toMatchObject({ connection: 'discovering', message: null });
		expect(driver.availability()).toEqual({ available: true });
		if (outcome === 'success') {
			driver.callbacks.onFinishDiscoveringReaders();
			await expect(pending).resolves.toEqual([]);
			expect(driver.availability()).toEqual({ available: true });
		} else {
			const rejected = expect(pending).rejects.toThrow('Scan failed');
			driver.callbacks.onFinishDiscoveringReaders({
				code: outcome === 'bluetooth' ? 'BluetoothError' : 'NetworkError',
				message: 'Scan failed',
			});
			await rejected;
			expect(driver.status$.get().message).toBe('Scan failed');
			expect(driver.availability()).toEqual(
				outcome === 'bluetooth'
					? { available: false, reason: 'bluetooth_off' }
					: { available: true }
			);
		}
	}
);

it.each(['result', 'callback', 'rejection'])(
	'publishes a generic discovery %s without disabling the tile',
	async (source) => {
		const error = { code: 'NetworkError', message: 'Cannot discover Bluetooth readers' };
		const listener = jest.fn();
		const unsubscribe = driver.status$.subscribe(listener);
		if (source === 'result') api.discoverReaders.mockResolvedValueOnce({ error });
		if (source === 'rejection') api.discoverReaders.mockRejectedValueOnce(new Error(error.message));
		const rejected = expect(driver.discoverReaders('bluetooth')).rejects.toThrow(error.message);
		await jest.advanceTimersByTimeAsync(0);
		if (source === 'callback') driver.callbacks.onFinishDiscoveringReaders(error);
		await rejected;
		expect(driver.availability()).toEqual({ available: true });
		expect(listener).toHaveBeenLastCalledWith(
			expect.objectContaining({ connection: 'disconnected', message: error.message })
		);
		unsubscribe();
	}
);

it.each([
	{ dev: true, testMode: true, simulated: true },
	{ dev: true, testMode: false, simulated: false },
	{ dev: true, testMode: 'true', simulated: false },
	{ dev: true, testMode: undefined, simulated: false },
	{ dev: false, testMode: true, simulated: false },
])('resolves discovery test mode before collect: %j', async ({ dev, testMode, simulated }) => {
	const originalDev = __DEV__;
	try {
		Object.assign(global, { __DEV__: dev });
		resolveMethod.mockReturnValue({ ...method, provider_data: { test_mode: testMode } });
		await discover();
		expect(api.discoverReaders).toHaveBeenLastCalledWith({
			discoveryMethod: 'bluetoothScan',
			simulated,
		});
	} finally {
		Object.assign(global, { __DEV__: originalDev });
	}
});

it('prefers the current resolved descriptor over previously collected test mode', async () => {
	await driver.collect({ ...input, method: { ...method, provider_data: { test_mode: true } } });
	resolveMethod.mockReturnValue({ ...method, provider_data: { test_mode: false } });
	await discover();
	expect(api.discoverReaders).toHaveBeenLastCalledWith({
		discoveryMethod: 'bluetoothScan',
		simulated: false,
	});
	resolveMethod.mockReturnValue({ ...method, provider_data: { test_mode: true } });
	await discover('tap_to_pay');
	expect(api.discoverReaders).toHaveBeenLastCalledWith({
		discoveryMethod: 'tapToPay',
		simulated: true,
	});
});

it.each(['10', '10.5'])('uses configured precision for %s online and offline', async (amount) => {
	const value = { ...input, row: { ...row, amount } };
	await expect(driver.collect(value)).resolves.toMatchObject({ amount: '11.25' });
	await driver.collect({ ...value, offline: true });
	expect(api.createPaymentIntent).toHaveBeenCalledWith(
		expect.objectContaining({ amount: amount === '10' ? 1000 : 1050 })
	);
});
it.each([
	['poweredOff', 'Reader powered off'],
	['bluetoothDisabled', 'Bluetooth is off'],
	['bluetoothSignalLost', 'Reader out of range'],
	['unknown', 'Reader disconnected'],
	[undefined, 'Reader disconnected'],
] as const)('shows a friendly disconnect reason for %s', (reason, message) => {
	driver.callbacks.onDidDisconnect(reason);
	expect(driver.status$.get().message).toBe(message);
});
it('rejects offline reconnection before waiting for the SDK or requesting a token', async () => {
	await discover();
	await driver.connect(info, handoff);
	driver.callbacks.onDidDisconnect('bluetoothSignalLost');
	driver.bindSdk(null);
	await expect(driver.connect(info, null)).rejects.toThrow(
		'Reconnecting needs a connection to the store'
	);
	expect(driver.status$.get().message).toBe('Reconnecting needs a connection to the store');
	expect(bootstrap).not.toHaveBeenCalled();
	expect(api.connectReader).toHaveBeenCalledTimes(1);
});
it.each(['operation', 'foreground', 'descriptors'])(
	'retries failed init on %s, with a single flight and 15s bound',
	async (trigger) => {
		const os = Platform.OS;
		Platform.OS = 'ios';
		let foreground!: (state: AppStateStatus) => void;
		jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
			foreground = listener;
			return { remove: jest.fn() };
		});
		jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
		driver.bindSdk(null);
		if (trigger === 'descriptors')
			api.initialize.mockResolvedValueOnce({
				error: { code: 'InitializationError', message: 'Store bootstrap unavailable' },
			});
		else api.initialize.mockRejectedValueOnce(new Error('Store bootstrap unavailable'));
		let tree!: ReactTestRenderer;
		try {
			await act(async () => {
				tree = create(<StripeTerminalDriverBridge driver={driver} />);
			});
			expect(driver.status$.get().message).toBe('Store bootstrap unavailable');
			await act(async () => {
				foreground('active');
			});
			expect(api.initialize).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(14999);
			await act(async () => {
				foreground('active');
			});
			expect(api.initialize).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(1);
			let finish!: (value: object) => void;
			api.initialize.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					})
			);
			let operation: Promise<void> | undefined;
			await act(async () => {
				if (trigger === 'operation') operation = driver.cancel();
				else if (trigger === 'foreground') foreground('active');
				else tree.update(<StripeTerminalDriverBridge driver={driver} methods={[method]} />);
			});
			expect(api.initialize).toHaveBeenCalledTimes(2);
			await act(async () => {
				foreground('active');
			});
			expect(api.initialize).toHaveBeenCalledTimes(2);
			await act(async () => {
				finish({});
			});
			await operation;
			await driver.cancel();
			expect(api.cancelCollectPaymentMethod).toHaveBeenCalled();
			expect(driver.status$.get().message).toBeNull();
		} finally {
			await act(async () => tree?.unmount());
			Platform.OS = os;
		}
	}
);
it.each(['foreground', 'discover'])(
	'rechecks denied Android permissions on %s',
	async (trigger) => {
		const os = Platform.OS;
		Platform.OS = 'android';
		let foreground!: (state: AppStateStatus) => void;
		jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
			foreground = listener;
			return { remove: jest.fn() };
		});
		const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
		jest
			.mocked(requestNeededAndroidPermissions)
			.mockResolvedValueOnce({ error: { location: 'denied' } })
			.mockResolvedValue({ error: null });
		jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
		driver.bindSdk(null);
		let tree!: ReactTestRenderer;
		try {
			await act(async () => {
				tree = create(<StripeTerminalDriverBridge driver={driver} />);
			});
			expect(driver.availability()).toEqual({ available: false, reason: 'permission' });
			await jest.advanceTimersByTimeAsync(15000);
			check.mockClear();
			if (trigger === 'foreground') {
				check.mockResolvedValue(true);
				await act(async () => {
					foreground('active');
				});
				expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(1);
			} else {
				await act(async () => {
					await discover();
				});
				expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(2);
			}
			expect(check).toHaveBeenCalled();
			expect(api.initialize).toHaveBeenCalledTimes(1);
			expect(driver.availability()).toEqual({ available: true });
		} finally {
			await act(async () => tree?.unmount());
			Platform.OS = os;
		}
	}
);

it('keeps one initialization in flight through StrictMode effect replay', async () => {
	const os = Platform.OS;
	Platform.OS = 'ios';
	jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
	driver.bindSdk(null);
	let finish!: (value: object) => void;
	api.initialize.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	let tree!: ReactTestRenderer;
	try {
		await act(async () => {
			tree = create(
				<React.StrictMode>
					<StripeTerminalDriverBridge driver={driver} />
				</React.StrictMode>
			);
		});
		expect(api.initialize).toHaveBeenCalledTimes(1);
		await act(async () => {
			finish({});
		});
		await driver.cancel();
		expect(api.cancelCollectPaymentMethod).toHaveBeenCalledTimes(1);
	} finally {
		await act(async () => tree?.unmount());
		Platform.OS = os;
	}
});
