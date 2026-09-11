import { PermissionsAndroid, Platform } from 'react-native';

import type {
	CollectResult,
	DriverStatus,
	PaymentDriver,
} from '@wcpos/core/services/payment-drivers/types';
import { fromMinor, type PaymentMethodDescriptor, toMinor } from '@wcpos/order-math';

import { getSumUpReader } from '../../../modules/sumup-reader';

export type Options = {
	bootstrap: (methodId: string) => Promise<Record<string, unknown>>;
	resolveMethod: () => PaymentMethodDescriptor | null;
};
export function createSumUpDriver({ bootstrap, resolveMethod }: Options) {
	let configuredMethod: string | null = null;
	let configuredDescriptor: string | null = null;
	let merchantCode: string | null = null;
	let initialization: Promise<void> | null = null;
	let loggedIn = false;
	let permissionDenied = false;
	let status: DriverStatus = { connection: 'disconnected', reader: null };
	const listeners = new Set<(status: DriverStatus) => void>();
	const publish = (next: DriverStatus) => {
		status = next;
		listeners.forEach((listener) => listener(status));
	};
	const isPermissionError = (error: unknown) =>
		Platform.OS === 'android' &&
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'ERR_SUMUP_PERMISSION';
	const reportError = (error: unknown) => {
		if (isPermissionError(error)) {
			permissionDenied = true;
			publish({ ...status });
			return;
		}
		publish({
			connection: 'disconnected',
			reader: null,
			message: error instanceof Error ? error.message : String(error),
		});
	};
	const rethrowPermissionError = (error: unknown): never => {
		if (isPermissionError(error)) reportError(error);
		throw error;
	};
	const enabledMethod = () => {
		const method = resolveMethod();
		return method?.pos_enabled &&
			method.capture.mode === 'device' &&
			method.capture.provider === 'sumup'
			? method
			: null;
	};
	const native = () => {
		const sdk = Platform.OS === 'web' ? null : getSumUpReader();
		if (!sdk) throw new Error('SumUp reader is unavailable on this platform');
		return sdk;
	};
	const refreshStatus = async () => {
		try {
			if (permissionDenied) await permissions();
			const sessionLoggedIn =
				configuredMethod !== null &&
				enabledMethod()?.id === configuredMethod &&
				(await native().isLoggedIn());
			const saved = sessionLoggedIn ? await native().readerStatus() : null;
			loggedIn = sessionLoggedIn;
			// SumUp reconnects a saved (possibly sleeping) reader inside its checkout UI.
			publish(
				saved?.serial
					? {
							connection: 'connected',
							reader: {
								id: saved.serial,
								label: `${saved.model} ${saved.serial}`,
								model: saved.model,
								serial: saved.serial,
								battery: saved.battery,
								transport: 'bluetooth',
							},
						}
					: { connection: 'disconnected', reader: null }
			);
		} catch (error) {
			if (!isPermissionError(error)) loggedIn = false;
			reportError(error);
			throw error;
		}
	};
	const initialize = async (): Promise<void> => {
		const method = enabledMethod();
		if (!method || Platform.OS === 'web' || !getSumUpReader()) return;
		if (initialization) return initialization;
		const fingerprint = JSON.stringify([
			method.id,
			Object.entries(method.provider_data).sort(([a], [b]) => a.localeCompare(b)),
		]);
		if (configuredMethod === method.id && configuredDescriptor === fingerprint) return;
		initialization = (async () => {
			const handoff = await bootstrap(method.id);
			if (typeof handoff.affiliate_key !== 'string' || !handoff.affiliate_key)
				throw new Error('No SumUp affiliate key returned by the store');
			if (typeof handoff.merchant_code !== 'string' || !handoff.merchant_code)
				throw new Error('No SumUp merchant code returned by the store');
			await native().setup(handoff.affiliate_key);
			merchantCode = handoff.merchant_code;
			configuredMethod = method.id;
			configuredDescriptor = fingerprint;
			await refreshStatus();
		})()
			.catch((error: unknown) => {
				if (!isPermissionError(error)) configuredMethod = null;
				reportError(error);
				throw error;
			})
			.finally(() => {
				initialization = null;
			});
		return initialization;
	};
	const permissions = async () => {
		if (Platform.OS !== 'android') return;
		const needed = [
			PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
			PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
		];
		if (Number(Platform.Version) >= 31)
			needed.push(
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
				PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
			);
		const granted = await PermissionsAndroid.requestMultiple(needed);
		permissionDenied = !needed.every(
			(name) => granted[name] === PermissionsAndroid.RESULTS.GRANTED
		);
		publish({ ...status });
		if (permissionDenied)
			rethrowPermissionError(
				Object.assign(
					new Error('Allow location and Bluetooth permissions to use the SumUp reader'),
					{ code: 'ERR_SUMUP_PERMISSION' }
				)
			);
	};
	const ready = async () => {
		await initialize();
		if (!enabledMethod() || configuredMethod !== enabledMethod()?.id)
			throw new Error('SumUp is not set up for this store');
		return native();
	};
	return {
		provider: 'sumup',
		capabilities: { discovery: 'sdk_ui', cancel: 'on_device', refund: false },
		initialize,
		refreshStatus,
		reportError,
		availability(): ReturnType<PaymentDriver['availability']> {
			if (Platform.OS === 'web') return { available: false, reason: 'web' };
			if (!getSumUpReader()) return { available: false, reason: 'unsupported' };
			if (permissionDenied) return { available: false, reason: 'permission' };
			return configuredMethod !== null && configuredMethod === enabledMethod()?.id && loggedIn
				? { available: true }
				: { available: false, reason: 'not_logged_in' };
		},
		async openReaderSettings() {
			try {
				const sdk = await ready();
				await permissions();
				// Account changes happen only from the cashier's explicit Connect Reader action.
				if ((await sdk.isLoggedIn()) && (await sdk.merchant())?.merchantCode !== merchantCode)
					await sdk.logout();
				if (!(await sdk.isLoggedIn())) await sdk.login({});
				if (!(await sdk.isLoggedIn())) throw new Error('SumUp login was cancelled');
				await sdk.openReaderSettings();
				await refreshStatus();
			} catch (error) {
				reportError(error);
				throw error;
			}
		},
		async collect(input: Parameters<PaymentDriver['collect']>[0]): Promise<CollectResult> {
			if (input.offline) throw new Error('SumUp offline payments are not supported');
			if (input.transport !== 'bluetooth') throw new Error('SumUp requires a Bluetooth reader');
			const sdk = await ready();
			if ((await sdk.merchant().catch(rethrowPermissionError))?.merchantCode !== merchantCode)
				throw new Error(
					'SumUp account does not match this store. Use Connect Reader to log in again.'
				);
			await permissions();
			await sdk.prepareForCheckout().catch(rethrowPermissionError);
			const checkout = sdk.checkout({
				amount: input.row.amount,
				currency: input.row.currency,
				title: input.row.order_id == null ? 'Order' : `Order ${input.row.order_id}`,
				foreignTransactionId: input.row.id,
				tipOnReader:
					input.tipEligibleMinor != null &&
					(await sdk.isTipOnReaderAvailable().catch(rethrowPermissionError)),
				skipSuccessScreen: true,
			});
			const result = await checkout.catch(rethrowPermissionError);
			const base = { amount: null, receipt: {}, provider_refs: {}, transport: input.transport };
			// A previous attempt may have charged: Pro must verify this row by lookup.
			if (result.resultCode === 9 || result.resultCode === 53)
				return {
					...base,
					outcome: 'authorized',
					provider_refs: { foreign_transaction_id: input.row.id },
				};
			switch (result.outcome) {
				case 'success':
					return {
						...base,
						outcome: 'captured',
						provider_refs: {
							transaction_code: result.transactionCode ?? null,
							foreign_transaction_id: input.row.id,
						},
						receipt: { brand: result.cardType, last4: result.last4 },
						amount:
							result.amount == null ||
							!/^\d+(\.\d+)?$/.test(result.amount) ||
							!Number.isFinite(Number(result.amount))
								? null
								: fromMinor(toMinor(result.amount, input.dp), input.dp),
					};
				case 'cancelled':
					return { ...base, outcome: 'cancelled' };
				case 'failed':
					return {
						...base,
						outcome: 'declined',
						failure_reason: result.message || `SumUp result ${result.resultCode ?? 'failed'}`,
					};
				case 'unknown':
					return {
						...base,
						outcome: 'authorized',
						provider_refs: { foreign_transaction_id: input.row.id },
					};
				default:
					throw new Error('SumUp returned an unrecognized checkout outcome');
			}
		},
		status$: {
			get: () => status,
			subscribe: (listener: (status: DriverStatus) => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
	} satisfies PaymentDriver & Record<string, unknown>;
}
