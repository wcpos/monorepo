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
// The default run is a simulator; a test sets `global.mockIsDevice` to stand on a real device.
// (A getter, because the driver's import resolves the mock before any test-scope variable exists.)
jest.mock('expo-device', () => ({
	get isDevice() {
		return (globalThis as { mockIsDevice?: boolean }).mockIsDevice === true;
	},
}));

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
		setSimulatedCard: jest.fn().mockResolvedValue({}),
		setSimulatedOfflineMode: jest.fn().mockResolvedValue({}),
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
	// No method yet: the provider waits for one before concluding the store has none…
	const waiting = tokenProvider();
	await jest.advanceTimersByTimeAsync(1000);
	resolveMethod.mockReturnValue({ ...method, id: 'late_method' });
	await jest.advanceTimersByTimeAsync(200);
	await expect(waiting).resolves.toBe('fresh');
	expect(bootstrap).toHaveBeenLastCalledWith('late_method');
	// …and gives up only after the wait.
	resolveMethod.mockReturnValue(null);
	const rejected = expect(tokenProvider()).rejects.toThrow(
		'Stripe Terminal is not enabled on this store'
	);
	await jest.advanceTimersByTimeAsync(5000);
	await rejected;
	expect(bootstrap).toHaveBeenCalledTimes(3);
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
// The SDK can hold a reader the driver no longer knows about (a logout or store switch resets
// the driver, not the SDK), so the release runs on every scan; the driver's own state only
// changes when it believed it was connected.
it('a "not connected" answer while the driver believed it was connected counts as released', async () => {
	await discover();
	await driver.connect(info, handoff);
	api.disconnectReader.mockClear();
	api.disconnectReader.mockResolvedValueOnce({
		error: { code: 'NOT_CONNECTED_TO_READER', message: 'No reader is connected.' },
	});
	const pending = driver.discoverReaders('bluetooth');
	await jest.advanceTimersByTimeAsync(0);
	expect(api.disconnectReader).toHaveBeenCalledTimes(1);
	expect(driver.status$.get()).toMatchObject({ connection: 'discovering', reader: null });
	driver.callbacks.onFinishDiscoveringReaders();
	await expect(pending).resolves.toEqual([]);
	expect(driver.status$.get().connection).toBe('disconnected');
});
it.each([true, false])(
	'releases the SDK reader before every scan (connected=%s)',
	async (connected) => {
		if (connected) {
			await discover();
			await driver.connect(info, handoff);
		}
		api.discoverReaders.mockClear();
		api.disconnectReader.mockClear();
		const listener = jest.fn();
		const unsubscribe = driver.status$.subscribe(listener);
		try {
			let finishDisconnect!: (result: object) => void;
			api.disconnectReader.mockImplementationOnce(
				() => new Promise((resolve) => (finishDisconnect = resolve))
			);
			const pending = driver.discoverReaders('bluetooth');
			await jest.advanceTimersByTimeAsync(0);
			expect(api.disconnectReader).toHaveBeenCalledTimes(1);
			expect(api.discoverReaders).not.toHaveBeenCalled();
			if (connected) {
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
				// A "not connected" answer from the SDK is the expected case here and is not an error.
				finishDisconnect({ error: { code: 'NotConnectedToReader', message: 'No reader' } });
				await jest.advanceTimersByTimeAsync(0);
				expect(listener).not.toHaveBeenCalledWith(
					expect.objectContaining({ connection: 'disconnected' })
				);
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
it('a scan started mid-reconnect clears the reader the SDK kept, so the result never reads "connected"', async () => {
	await discover();
	await driver.connect(info, handoff);
	driver.callbacks.onDidStartReaderReconnect(rawReader);
	expect(driver.status$.get()).toMatchObject({ connection: 'connecting', reader: info });
	api.disconnectReader.mockClear();
	api.disconnectReader.mockResolvedValueOnce({
		error: { code: 'NotConnectedToReader', message: '' },
	});
	const pending = driver.discoverReaders('bluetooth');
	await jest.advanceTimersByTimeAsync(0);
	expect(api.disconnectReader).toHaveBeenCalledTimes(1);
	expect(driver.status$.get()).toMatchObject({ connection: 'discovering', reader: null });
	driver.callbacks.onFinishDiscoveringReaders();
	await expect(pending).resolves.toEqual([]);
	expect(driver.status$.get()).toMatchObject({ connection: 'disconnected', reader: null });
});
// The reader already has the card and the SDK is confirming: nothing to cancel, nothing to report.
it.each(['CancelFailedAlreadyCompleted', 'CANCEL_FAILED_ALREADY_COMPLETED'])(
	'cancel treats %s as "too late", not as an error',
	async (code) => {
		api.cancelCollectPaymentMethod.mockResolvedValueOnce({ error: { code, message: 'done' } });
		await expect(driver.cancel()).resolves.toBeUndefined();
	}
);
it('cancel still reports a real failure', async () => {
	api.cancelCollectPaymentMethod.mockResolvedValueOnce({
		error: { code: 'CANCEL_FAILED', message: 'No collect in progress' },
	});
	await expect(driver.cancel()).rejects.toThrow('No collect in progress');
});
// iOS and the simulator say `Canceled`; the Android SDK says `CANCELED` (a WisePad 3 cancel
// from the till rendered as "reader_error" until both were accepted, 2026-10-06).
it.each([
	...(['retrievePaymentIntent', 'collectPaymentMethod', 'confirmPaymentIntent'] as const).flatMap(
		(operation) => [
			{ operation, code: 'Canceled' },
			{ operation, code: 'CANCELED' },
		]
	),
])('maps $code from $operation to a cancelled outcome', async ({ operation, code }) => {
	api[operation].mockResolvedValue({ error: { code, message: 'User canceled the transaction.' } });
	await expect(driver.collect(input)).resolves.toMatchObject({
		outcome: 'cancelled',
		provider_refs: {},
		amount: null,
	});
});
it('stops a scan the moment the awaited reader appears instead of running the window out', async () => {
	const pending = driver.discoverReaders('bluetooth', { until: rawReader.serialNumber });
	await jest.advanceTimersByTimeAsync(0);
	api.cancelDiscovering.mockClear(); // the start-of-scan cancel of any previous discovery
	driver.callbacks.onUpdateDiscoveredReaders([{ ...rawReader, serialNumber: 'OTHER' }]);
	await jest.advanceTimersByTimeAsync(0);
	expect(api.cancelDiscovering).not.toHaveBeenCalled();
	driver.callbacks.onUpdateDiscoveredReaders([{ ...rawReader, serialNumber: 'OTHER' }, rawReader]);
	await jest.advanceTimersByTimeAsync(0);
	expect(api.cancelDiscovering).toHaveBeenCalledTimes(1);
	await expect(pending).resolves.toEqual([
		{ ...info, id: 'OTHER', serial: 'OTHER', label: 'stripeM2 OTHER' },
		info,
	]);
	// The window's own timer must not fire a second cancel later.
	await jest.advanceTimersByTimeAsync(10000);
	expect(api.cancelDiscovering).toHaveBeenCalledTimes(1);
});
it('without `until`, a discovered reader does not end the scan early', async () => {
	const pending = driver.discoverReaders('bluetooth');
	await jest.advanceTimersByTimeAsync(0);
	api.cancelDiscovering.mockClear();
	driver.callbacks.onUpdateDiscoveredReaders([rawReader]);
	await jest.advanceTimersByTimeAsync(0);
	expect(api.cancelDiscovering).not.toHaveBeenCalled();
	driver.callbacks.onFinishDiscoveringReaders();
	await expect(pending).resolves.toEqual([info]);
});
it.each([
	{ code: 'DeclinedByStripeAPI', declineCode: 'insufficient_funds' },
	{ code: 'DeclinedByStripeAPI' },
	// The Android SDK spells the same code from its catalogue.
	{ code: 'DECLINED_BY_STRIPE_API' },
	{ code: 'DECLINED_BY_STRIPE_API', declineCode: 'insufficient_funds' },
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
	'prompts for Android permissions on the first reader operation, never at launch (granted=%s)',
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
			// Launch with the permissions still missing: no dialog, no SDK, tile stays enabled.
			expect(requestNeededAndroidPermissions).not.toHaveBeenCalled();
			expect(api.initialize).not.toHaveBeenCalled();
			expect(driver.availability()).toEqual({ available: true });
			await act(async () => {
				await driver.requestInitialization().catch(() => {});
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
		const notEnabled = expect(tokenProvider()).rejects.toThrow('not enabled');
		await act(async () => {
			await jest.advanceTimersByTimeAsync(5000);
		});
		await notEnabled;
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
		const rejected = expect(tokenProvider()).rejects.toThrow(
			'Stripe Terminal is not enabled on this store'
		);
		await act(async () => {
			await jest.advanceTimersByTimeAsync(5000);
		});
		await rejected;
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
	{ dev: true, device: false, testMode: true, simulated: true },
	{ dev: true, device: false, testMode: false, simulated: false },
	{ dev: true, device: false, testMode: 'true', simulated: false },
	{ dev: true, device: false, testMode: undefined, simulated: false },
	{ dev: false, device: false, testMode: true, simulated: false },
	// A real phone or tablet scans for real hardware even against a test-mode gateway.
	{ dev: true, device: true, testMode: true, simulated: false },
	{ dev: false, device: true, testMode: true, simulated: false },
])(
	'resolves discovery test mode before collect: %j',
	async ({ dev, device, testMode, simulated }) => {
		const originalDev = __DEV__;
		try {
			Object.assign(global, { __DEV__: dev, mockIsDevice: device });
			resolveMethod.mockReturnValue({ ...method, provider_data: { test_mode: testMode } });
			await discover();
			expect(api.discoverReaders).toHaveBeenLastCalledWith({
				discoveryMethod: 'bluetoothScan',
				simulated,
			});
		} finally {
			Object.assign(global, { __DEV__: originalDev, mockIsDevice: false });
		}
	}
);

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
it('initializes at launch on Android once the permissions are granted (offline forwarding)', async () => {
	// The SDK forwards stored offline payments by itself once it is running — a till that
	// has taken a card payment must not wait for a cashier action after a relaunch.
	const os = Platform.OS;
	Platform.OS = 'android';
	jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
	jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
	driver.bindSdk(null);
	let tree!: ReactTestRenderer;
	try {
		await act(async () => {
			tree = create(<StripeTerminalDriverBridge driver={driver} />);
		});
		expect(requestNeededAndroidPermissions).not.toHaveBeenCalled();
		expect(api.initialize).toHaveBeenCalledTimes(1);
		expect(driver.availability()).toEqual({ available: true });
	} finally {
		await act(async () => tree?.unmount());
		Platform.OS = os;
	}
});
it('a reader operation that joins an in-flight quiet launch check still prompts', async () => {
	const os = Platform.OS;
	Platform.OS = 'android';
	let settle!: (granted: boolean) => void;
	jest.spyOn(PermissionsAndroid, 'check').mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			})
	);
	jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
	jest.mocked(requestNeededAndroidPermissions).mockResolvedValue({ error: null });
	jest.mocked(useStripeTerminal).mockReturnValue(api as unknown as Sdk);
	driver.bindSdk(null);
	let tree!: ReactTestRenderer;
	try {
		await act(async () => {
			tree = create(<StripeTerminalDriverBridge driver={driver} />);
		});
		// The launch check is still pending when the cashier starts an operation.
		const operation = driver.requestInitialization();
		settle(false);
		await act(async () => {
			await operation;
		});
		expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(1);
		expect(api.initialize).toHaveBeenCalledTimes(1);
	} finally {
		await act(async () => tree?.unmount());
		Platform.OS = os;
	}
});
it('forgets a refused Android prompt when the bridge unmounts, so a remount can ask again', async () => {
	const os = Platform.OS;
	Platform.OS = 'android';
	jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
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
		await act(async () => {
			await driver.requestInitialization().catch(() => {});
		});
		expect(driver.availability()).toEqual({ available: false, reason: 'permission' });
		await act(async () => tree.unmount());
		// The payment tile reads availability(); a stale refusal would keep it disabled with
		// no way to trigger the operation that prompts again.
		expect(driver.availability()).toEqual({ available: true });
		await act(async () => {
			tree = create(<StripeTerminalDriverBridge driver={driver} />);
		});
		expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(1);
		await act(async () => {
			await driver.requestInitialization();
		});
		expect(requestNeededAndroidPermissions).toHaveBeenCalledTimes(2);
		expect(api.initialize).toHaveBeenCalledTimes(1);
		expect(driver.availability()).toEqual({ available: true });
	} finally {
		await act(async () => tree?.unmount());
		Platform.OS = os;
	}
});
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
			await act(async () => {
				await driver.requestInitialization().catch(() => {});
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

describe('simulated reader dev controls', () => {
	async function connectSimulated() {
		await discover();
		driver.callbacks.onUpdateDiscoveredReaders([{ ...rawReader, simulated: true }]);
		await driver.connect(info, handoff);
	}
	it('offers controls only for a connected simulated discovery reader', async () => {
		expect(driver.devControls()).toEqual([]);
		await discover();
		await driver.connect(info, handoff);
		expect(driver.devControls()).toEqual([]);
		await connectSimulated();
		expect(driver.devControls()).toHaveLength(5);
		expect(
			driver
				.devControls()
				.filter((control) => control.active)
				.map((control) => control.id)
		).toEqual(['card-approve']);
		await driver.disconnect();
		expect(driver.devControls()).toEqual([]);
	});
	it.each([
		['card-approve', 'Card: approve (4242)', '4242424242424242'],
		['card-declined', 'Card: declined (…0002)', '4000000000000002'],
		['card-insufficient-funds', 'Card: insufficient funds (…9995)', '4000000000009995'],
		['card-offline-pin', 'Card: offline PIN (…0002)', '4001007020000002'],
	])('selects %s through the SDK and updates the selected card', async (id, label, number) => {
		await connectSimulated();
		await driver
			.devControls()
			.find((control) => control.id === 'card-declined')!
			.run();
		const control = driver.devControls().find((control) => control.id === id)!;
		expect(control.label).toBe(label);
		await control.run();
		expect(api.setSimulatedCard).toHaveBeenLastCalledWith(number);
		expect(
			driver
				.devControls()
				.filter((control) => control.active)
				.map((control) => control.id)
		).toEqual([id]);
	});
	it('toggles simulated offline mode in both directions with matching label and active state', async () => {
		await connectSimulated();
		const offline = () => driver.devControls().find((control) => control.id === 'offline')!;
		expect(offline()).toMatchObject({ label: 'Simulated offline: off', active: false });
		await offline().run();
		expect(api.setSimulatedOfflineMode).toHaveBeenLastCalledWith(true);
		expect(offline()).toMatchObject({ label: 'Simulated offline: on', active: true });
		await offline().run();
		expect(api.setSimulatedOfflineMode).toHaveBeenLastCalledWith(false);
		expect(offline()).toMatchObject({ label: 'Simulated offline: off', active: false });
	});
	it.each([
		['card-declined', 'setSimulatedCard'],
		['offline', 'setSimulatedOfflineMode'],
	] as const)('rejects SDK errors from %s without updating active state', async (id, operation) => {
		await connectSimulated();
		api[operation].mockResolvedValueOnce({
			error: { code: 'SimulationError', message: 'Cannot simulate' },
		});
		await expect(
			driver
				.devControls()
				.find((control) => control.id === id)!
				.run()
		).rejects.toThrow('Cannot simulate');
		expect(driver.status$.get().message).toBe('Cannot simulate');
		expect(driver.devControls().find((control) => control.id === id)!.active).toBe(false);
	});
});
