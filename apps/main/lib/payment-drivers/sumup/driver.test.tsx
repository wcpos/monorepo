import * as React from 'react';
import { AppState, type AppStateStatus, PermissionsAndroid, Platform } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
	method,
	row,
} from '@wcpos/core/screens/main/pos/checkout/payments/device/fixtures.test-utils';
import type { CollectInput } from '@wcpos/core/services/payment-drivers/types';
import { usePaymentMethods } from '@wcpos/core/screens/main/hooks/use-payment-methods';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { getDriver } from '@wcpos/core/services/payment-drivers/registry';

import { StripeTerminalDriverRegistration } from '../../payment-drivers';
import { getSumUpReader } from '../../../modules/sumup-reader';
import { SumUpDriverBridge } from './bridge';
// eslint-disable-next-line import/no-duplicates -- Exercise native and web implementations separately.
import { createSumUpDriver } from './driver';
// eslint-disable-next-line import/no-duplicates -- Resolver treats platform variants as the same file.
import { createSumUpDriver as createWebDriver } from './driver.web';

jest.resetModules();
jest.mock('../../../modules/sumup-reader', () => ({ getSumUpReader: jest.fn() }));
jest.mock('@wcpos/core/screens/main/hooks/use-payment-methods', () => ({
	usePaymentMethods: jest.fn(),
}));
jest.mock('@wcpos/core/screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: jest.fn(),
}));
jest.mock('../stripe-terminal', () => ({
	createStripeTerminalDriver: () => ({ provider: 'stripe' }),
	StripeTerminalDriverBridge: () => null,
}));
const descriptor = { ...method, capture: { ...method.capture, provider: 'sumup' } };
const input: CollectInput = {
	dp: 2,
	row,
	method: descriptor,
	transport: 'bluetooth',
	handoff: null,
	offline: false,
	tipEligibleMinor: 1000,
};
const saved = { connected: false, serial: 'R1', model: 'Solo', battery: 82 };
const success = {
	outcome: 'success',
	transactionCode: 'TX1',
	amount: '11.25',
	tipAmount: '1.25',
	currency: 'USD',
	cardType: 'VISA',
	last4: '1234',
};
function sdkMock() {
	return {
		setup: jest.fn().mockResolvedValue(undefined),
		isLoggedIn: jest.fn().mockResolvedValue(true),
		login: jest.fn().mockResolvedValue(undefined),
		logout: jest.fn().mockResolvedValue(undefined),
		merchant: jest.fn().mockResolvedValue({ merchantCode: 'M1', currencyCode: 'USD' }),
		openReaderSettings: jest.fn().mockResolvedValue(undefined),
		readerStatus: jest.fn().mockResolvedValue(saved),
		isTipOnReaderAvailable: jest.fn().mockResolvedValue(true),
		prepareForCheckout: jest.fn().mockResolvedValue(undefined),
		checkout: jest.fn().mockResolvedValue(success),
		addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
	};
}
let sdk: ReturnType<typeof sdkMock>;
let bootstrap: jest.Mock;
let resolveMethod: jest.Mock;
let driver: ReturnType<typeof createSumUpDriver>;
const os = Platform.OS;
beforeEach(() => {
	jest.clearAllMocks();
	Platform.OS = 'ios';
	sdk = sdkMock();
	jest.mocked(getSumUpReader).mockReturnValue(sdk);
	bootstrap = jest.fn().mockResolvedValue({ affiliate_key: 'key', merchant_code: 'M1' });
	resolveMethod = jest.fn().mockReturnValue(descriptor);
	driver = createSumUpDriver({ bootstrap, resolveMethod });
});
afterEach(() => {
	Platform.OS = os;
	jest.restoreAllMocks();
});
it('reports web, absent module, setup, and login availability', async () => {
	Platform.OS = 'web';
	expect(driver.availability()).toEqual({ available: false, reason: 'web' });
	Platform.OS = 'ios';
	jest.mocked(getSumUpReader).mockReturnValue(null);
	expect(driver.availability()).toEqual({ available: false, reason: 'unsupported' });
	jest.mocked(getSumUpReader).mockReturnValue(sdk);
	expect(driver.availability()).toEqual({ available: false, reason: 'not_logged_in' });
	sdk.isLoggedIn.mockResolvedValue(false);
	await driver.initialize();
	expect(driver.availability()).toEqual({ available: false, reason: 'not_logged_in' });
	sdk.isLoggedIn.mockResolvedValue(true);
	await driver.refreshStatus();
	expect(driver.availability()).toEqual({ available: true });
});
it.each([
	null,
	{ ...descriptor, pos_enabled: false },
	{ ...descriptor, capture: { ...descriptor.capture, mode: 'server' } },
	method,
])('does not bootstrap an ineligible descriptor %j', async (value) => {
	resolveMethod.mockReturnValue(value);
	await driver.initialize();
	expect(bootstrap).not.toHaveBeenCalled();
	expect(sdk.setup).not.toHaveBeenCalled();
});
it('bootstraps once, retries a failed setup, and publishes a saved sleeping reader', async () => {
	sdk.setup.mockRejectedValueOnce(new Error('Setup unavailable'));
	await expect(driver.initialize()).rejects.toThrow('Setup unavailable');
	const listener = jest.fn();
	const unsubscribe = driver.status$.subscribe(listener);
	await Promise.all([driver.initialize(), driver.initialize()]);
	expect(bootstrap).toHaveBeenCalledWith('device');
	expect(sdk.setup).toHaveBeenCalledWith('key');
	await driver.initialize();
	expect(sdk.setup).toHaveBeenCalledTimes(2);
	expect(listener).toHaveBeenLastCalledWith(
		expect.objectContaining({
			connection: 'connected',
			reader: {
				id: 'R1',
				label: 'Solo R1',
				model: 'Solo',
				serial: 'R1',
				battery: 82,
				transport: 'bluetooth',
			},
		})
	);
	unsubscribe();
	sdk.readerStatus.mockResolvedValue(null);
	await driver.refreshStatus();
	expect(driver.status$.get()).toMatchObject({ connection: 'disconnected', reader: null });
});
it('logs in before reader settings and refreshes status afterwards', async () => {
	sdk.isLoggedIn.mockResolvedValue(false);
	sdk.login.mockImplementation(async () => {
		sdk.isLoggedIn.mockResolvedValue(true);
	});
	await driver.openReaderSettings();
	expect(sdk.login).toHaveBeenCalledWith({});
	expect(sdk.login.mock.invocationCallOrder[0]).toBeLessThan(
		sdk.openReaderSettings.mock.invocationCallOrder[0]
	);
	expect(driver.availability()).toEqual({ available: true });
	expect(driver.status$.get().reader?.id).toBe('R1');
});
it('does not open settings after cancelled login', async () => {
	sdk.isLoggedIn.mockResolvedValue(false);
	await expect(driver.openReaderSettings()).rejects.toThrow(/login/i);
	expect(sdk.openReaderSettings).not.toHaveBeenCalled();
});
it('sends exact row data, prepares first, and maps only the returned capture', async () => {
	await expect(driver.collect(input)).resolves.toEqual({
		outcome: 'captured',
		provider_refs: { transaction_code: 'TX1', foreign_transaction_id: 'leg' },
		receipt: { brand: 'VISA', last4: '1234' },
		amount: '11.25',
		transport: 'bluetooth',
	});
	expect(sdk.checkout).toHaveBeenCalledWith({
		amount: '10.00',
		currency: 'USD',
		title: 'Order 42',
		foreignTransactionId: 'leg',
		tipOnReader: true,
		skipSuccessScreen: true,
	});
	expect(sdk.prepareForCheckout.mock.invocationCallOrder[0]).toBeLessThan(
		sdk.checkout.mock.invocationCallOrder[0]
	);
	expect(driver).not.toHaveProperty('cancel');
});
it.each([
	['10', 2, '10.00'],
	['10.5', 3, '10.500'],
	['125', 0, '125'],
])('formats SDK amount %s with dp %s', async (amount, dp, expected) => {
	sdk.checkout.mockResolvedValue({ ...success, amount });
	await expect(driver.collect({ ...input, dp: dp as number })).resolves.toMatchObject({
		amount: expected,
	});
});
it.each([
	{ eligible: null, available: true },
	{ eligible: 1000, available: false },
])('does not enable unsupported/ineligible tips %j', async ({ eligible, available }) => {
	sdk.isTipOnReaderAvailable.mockResolvedValue(available);
	await driver.collect({ ...input, tipEligibleMinor: eligible });
	expect(sdk.checkout).toHaveBeenCalledWith(expect.objectContaining({ tipOnReader: false }));
	if (eligible === null) expect(sdk.isTipOnReaderAvailable).not.toHaveBeenCalled();
});
it.each([
	{ outcome: 'cancelled', expected: 'cancelled', resultCode: null },
	{ outcome: 'failed', expected: 'declined', resultCode: 2 },
	{ outcome: 'unknown', expected: 'authorized', resultCode: 15 },
])('maps $outcome without inventing capture data', async ({ outcome, expected, resultCode }) => {
	sdk.checkout.mockResolvedValue({ outcome, resultCode, message: 'SDK message' });
	await expect(driver.collect(input)).resolves.toMatchObject({
		outcome: expected,
		amount: null,
		receipt: {},
		provider_refs: outcome === 'unknown' ? { foreign_transaction_id: 'leg' } : {},
		...(outcome === 'failed' ? { failure_reason: 'SDK message' } : {}),
	});
});
it.each([9, 53])('authorizes duplicate foreign id %s for server lookup', async (resultCode) => {
	sdk.checkout.mockResolvedValue({ outcome: 'failed', resultCode });
	await expect(driver.collect(input)).resolves.toEqual({
		outcome: 'authorized',
		provider_refs: { foreign_transaction_id: 'leg' },
		receipt: {},
		amount: null,
		transport: 'bluetooth',
	});
});
it('does not replace absent SDK amount with the requested amount', async () => {
	sdk.checkout.mockResolvedValue({ outcome: 'success', transactionCode: 'TX1' });
	await expect(driver.collect(input)).resolves.toMatchObject({ amount: null });
});
it('rejects offline and tap-to-pay before opening checkout', async () => {
	await expect(driver.collect({ ...input, offline: true })).rejects.toThrow(/offline/i);
	await expect(driver.collect({ ...input, transport: 'tap_to_pay' })).rejects.toThrow(/Bluetooth/i);
	expect(sdk.checkout).not.toHaveBeenCalled();
});
it('refreshes on foreground and removes its subscription on unmount', async () => {
	let foreground!: (state: AppStateStatus) => void;
	const remove = jest.fn();
	jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
		foreground = listener;
		return { remove };
	});
	let tree!: ReactTestRenderer;
	await act(async () => {
		tree = create(<SumUpDriverBridge driver={driver} methods={[descriptor]} />);
	});
	expect(driver.status$.get().reader?.id).toBe('R1');
	sdk.isLoggedIn.mockResolvedValue(false);
	await act(async () => foreground('active'));
	expect(driver.availability()).toEqual({ available: false, reason: 'not_logged_in' });
	expect(driver.status$.get().reader).toBeNull();
	await act(async () => tree.unmount());
	expect(remove).toHaveBeenCalled();
});
it('requests Android runtime permissions before presenting the SDK', async () => {
	Platform.OS = 'android';
	const version = Platform.Version;
	Object.defineProperty(Platform, 'Version', { configurable: true, value: 31 });
	const request = jest
		.spyOn(PermissionsAndroid, 'requestMultiple')
		.mockImplementation(
			async (permissions) =>
				Object.fromEntries(permissions.map((p) => [p, 'granted'])) as Awaited<
					ReturnType<typeof PermissionsAndroid.requestMultiple>
				>
		);
	try {
		await driver.openReaderSettings();
		expect(request).toHaveBeenCalledWith(
			expect.arrayContaining([
				'android.permission.BLUETOOTH_SCAN',
				'android.permission.BLUETOOTH_CONNECT',
				'android.permission.ACCESS_FINE_LOCATION',
				'android.permission.ACCESS_COARSE_LOCATION',
			])
		);
		expect(request.mock.invocationCallOrder[0]).toBeLessThan(
			sdk.openReaderSettings.mock.invocationCallOrder[0]
		);
	} finally {
		Object.defineProperty(Platform, 'Version', { configurable: true, value: version });
	}
});
it('web entry is unavailable without exposing native collection', async () => {
	const web = createWebDriver({ bootstrap, resolveMethod });
	expect(web.availability()).toEqual({ available: false, reason: 'web' });
	await expect(web.collect(input)).rejects.toThrow(/web/i);
	await expect(web.openReaderSettings!()).rejects.toThrow(/web/i);
	expect(web.capabilities).toEqual({ discovery: 'sdk_ui', cancel: 'on_device', refund: false });
});
it.each(['', 'not-a-number', 'Infinity'])(
	'does not invent a zero amount for malformed SDK amount %s',
	async (amount) => {
		sdk.checkout.mockResolvedValue({ ...success, amount });
		await expect(driver.collect(input)).resolves.toMatchObject({ amount: null });
	}
);
it('refreshes login and reader status on native events', async () => {
	let changed!: () => void;
	const remove = jest.fn();
	sdk.addListener.mockImplementation((_event, listener) => {
		changed = listener;
		return { remove };
	});
	let tree!: ReactTestRenderer;
	await act(async () => {
		tree = create(<SumUpDriverBridge driver={driver} />);
	});
	sdk.isLoggedIn.mockResolvedValue(false);
	await act(async () => changed());
	expect(driver.availability()).toEqual({ available: false, reason: 'not_logged_in' });
	await act(async () => tree.unmount());
	expect(remove).toHaveBeenCalled();
});
it('registers a stable driver and bootstraps only a served enabled SumUp device method', async () => {
	const post = jest
		.fn()
		.mockResolvedValue({ data: { handoff: { affiliate_key: 'served', merchant_code: 'M1' } } });
	jest
		.mocked(useRestHttpClient)
		.mockReturnValue({ post } as unknown as ReturnType<typeof useRestHttpClient>);
	const methods = (values: ReturnType<typeof usePaymentMethods>['methods']) =>
		jest.mocked(usePaymentMethods).mockReturnValue({
			methods: values,
			byId: new Map(values.map((value) => [value.id, value])),
			contract: 'test',
			loaded: true,
			unsupportedSchema: false,
		});
	methods([]);
	let tree!: ReactTestRenderer;
	await act(async () => {
		tree = create(<StripeTerminalDriverRegistration />);
	});
	const registered = getDriver('sumup');
	expect(registered?.availability()).toEqual({ available: false, reason: 'not_logged_in' });
	for (const invalid of [
		method,
		{ ...descriptor, pos_enabled: false },
		{ ...descriptor, capture: { ...descriptor.capture, mode: 'server' as const } },
	]) {
		methods([invalid]);
		await act(async () => tree.update(<StripeTerminalDriverRegistration />));
	}
	expect(post).not.toHaveBeenCalled();
	methods([{ ...descriptor, id: 'sumup_store' }]);
	await act(async () => tree.update(<StripeTerminalDriverRegistration />));
	expect(post).toHaveBeenCalledWith('payment-methods/sumup_store/bootstrap', {});
	expect(sdk.setup).toHaveBeenCalledWith('served');
	expect(getDriver('sumup')).toBe(registered);
	expect(registered?.status$.get().reader?.transport).toBe('bluetooth');
	methods([]);
	await act(async () => tree.update(<StripeTerminalDriverRegistration />));
	expect(registered?.availability().available).toBe(false);
	await act(async () => tree.unmount());
});
it('rejects a different merchant before charging and allows account selection from Connect Reader', async () => {
	sdk.merchant.mockResolvedValue({ merchantCode: 'WRONG', currencyCode: 'USD' });
	await expect(driver.collect(input)).rejects.toThrow(/account.*store/i);
	expect(sdk.checkout).not.toHaveBeenCalled();
	sdk.logout.mockImplementation(async () => {
		sdk.isLoggedIn.mockResolvedValue(false);
	});
	sdk.login.mockImplementation(async () => {
		sdk.isLoggedIn.mockResolvedValue(true);
		sdk.merchant.mockResolvedValue({ merchantCode: 'M1', currencyCode: 'USD' });
	});
	await driver.openReaderSettings();
	expect(sdk.logout).toHaveBeenCalledTimes(1);
	expect(sdk.login).toHaveBeenCalledTimes(1);
	await expect(driver.collect(input)).resolves.toMatchObject({ outcome: 'captured' });
});

it('refreshes bootstrap and setup for changed provider data, not object identity or key order', async () => {
	resolveMethod.mockReturnValue({
		...descriptor,
		provider_data: { merchant_code: 'M1', affiliate_app_id: 'app1' },
	});
	await driver.initialize();
	resolveMethod.mockReturnValue({
		...descriptor,
		provider_data: { affiliate_app_id: 'app1', merchant_code: 'M1' },
	});
	await driver.initialize();
	expect(bootstrap).toHaveBeenCalledTimes(1);
	bootstrap.mockResolvedValue({ affiliate_key: 'changed-key', merchant_code: 'M2' });
	resolveMethod.mockReturnValue({
		...descriptor,
		provider_data: { merchant_code: 'M2', affiliate_app_id: 'app1' },
	});
	await driver.initialize();
	expect(bootstrap).toHaveBeenCalledTimes(2);
	expect(bootstrap).toHaveBeenLastCalledWith('device');
	expect(sdk.setup).toHaveBeenCalledTimes(2);
	expect(sdk.setup).toHaveBeenLastCalledWith('changed-key');
	await expect(driver.collect(input)).rejects.toThrow(/account.*store/i);
	expect(sdk.checkout).not.toHaveBeenCalled();
});
it.each(['settings', 'foreground'])(
	'rechecks denied Android permissions on %s without clearing login or saved reader',
	async (retry) => {
		Platform.OS = 'android';
		let granted = false;
		const request = jest
			.spyOn(PermissionsAndroid, 'requestMultiple')
			.mockImplementation(
				async (permissions) =>
					Object.fromEntries(
						permissions.map((p) => [p, granted ? 'granted' : 'denied'])
					) as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>
			);
		let foreground!: (state: AppStateStatus) => void;
		jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
			foreground = listener;
			return { remove: jest.fn() };
		});
		let tree!: ReactTestRenderer;
		await act(async () => {
			tree = create(<SumUpDriverBridge driver={driver} methods={[descriptor]} />);
		});
		try {
			const status = driver.status$.get();
			await expect(driver.openReaderSettings()).rejects.toThrow(/permissions/i);
			expect(driver.availability()).toEqual({ available: false, reason: 'permission' });
			expect(driver.status$.get()).toEqual(status);
			// useSyncExternalStore needs a new snapshot to display changed availability.
			expect(driver.status$.get()).not.toBe(status);
			expect(sdk.openReaderSettings).not.toHaveBeenCalled();
			granted = true;
			if (retry === 'settings') await driver.openReaderSettings();
			else await act(async () => foreground('active'));
			expect(request).toHaveBeenCalledTimes(2);
			expect(driver.availability()).toEqual({ available: true });
			expect(driver.status$.get()).toEqual(status);
			expect(sdk.login).not.toHaveBeenCalled();
			expect(sdk.logout).not.toHaveBeenCalled();
		} finally {
			await act(async () => tree.unmount());
		}
	}
);
it.each([
	'openReaderSettings',
	'prepareForCheckout',
	'checkout',
	'readerStatus',
	'merchant',
	'isTipOnReaderAvailable',
] as const)(
	'reports native %s permission denial without forgetting the saved reader',
	async (operation) => {
		Platform.OS = 'android';
		jest
			.spyOn(PermissionsAndroid, 'requestMultiple')
			.mockImplementation(
				async (permissions) =>
					Object.fromEntries(permissions.map((p) => [p, 'granted'])) as Awaited<
						ReturnType<typeof PermissionsAndroid.requestMultiple>
					>
			);
		await driver.initialize();
		const status = driver.status$.get();
		const error = Object.assign(new Error('Bluetooth permission denied'), {
			code: 'ERR_SUMUP_PERMISSION',
		});
		sdk[operation].mockRejectedValueOnce(error);
		const attempt =
			operation === 'openReaderSettings'
				? driver.openReaderSettings()
				: operation === 'readerStatus'
					? driver.refreshStatus()
					: driver.collect(input);
		await expect(attempt).rejects.toBe(error);
		expect(driver.availability()).toEqual({ available: false, reason: 'permission' });
		expect(driver.status$.get()).toEqual(status);
		await driver.openReaderSettings();
		expect(driver.availability()).toEqual({ available: true });
		expect(driver.status$.get()).toEqual(status);
		expect(sdk.login).not.toHaveBeenCalled();
		expect(sdk.logout).not.toHaveBeenCalled();
	}
);
