import { type Permission, PermissionsAndroid, Platform } from 'react-native';

import type {
	CollectResult,
	DriverStatus,
	PaymentDriver,
} from '@wcpos/core/services/payment-drivers/types';
import {
	fromMinor,
	type PaymentMethodDescriptor,
	type PaymentTransport,
	toMinor,
} from '@wcpos/order-math';

import { getSumUpReader } from '../../../modules/sumup-reader';

// SumUp's offline sessions run on these readers only (Solo ≥ 3.3.31.0, Solo Lite ≥ 2.2.1.25;
// the SDK refuses older firmware itself). The Air and Tap to Pay have no offline (roadmap#427).
const OFFLINE_READER_MODELS = new Set(['SOLO', 'SOLO_LITE']);
// The session query is local to the SDK; one that never answers must not hold a checkout.
const OFFLINE_QUERY_TIMEOUT_MS = 5000;

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
	// SumUp's offline calls are strictly serial: a sync never starts during a checkout (it runs
	// after it instead), and a checkout waits for a sync already running.
	let collecting = false;
	let syncSkipped = false;
	let syncing: Promise<void> | null = null;
	// The till's connectivity as the bridge last saw it.
	let online = false;
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
		const needed: Permission[] = [
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
	const optedIn = () => enabledMethod()?.capabilities.offline === 'queue';
	// The descriptor says the merchant opted in; the saved reader says whether it can.
	const queuesOffline = (transport: PaymentTransport) =>
		transport === 'bluetooth' &&
		loggedIn &&
		optedIn() &&
		OFFLINE_READER_MODELS.has(status.reader?.model ?? '');
	// Whether a session runs, and whether this app started one SumUp has not confirmed uploaded
	// (the native module answers without an SDK call when it has not, so a store that never
	// opted in pays nothing). Gated on that marker, not the opt-in: a session survives the
	// setting being turned off.
	const offlineSession = (sdk: ReturnType<typeof native>) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		return Promise.race([
			sdk.offlineSession(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('SumUp did not report its offline session')),
					OFFLINE_QUERY_TIMEOUT_MS
				);
			}),
		]).finally(() => clearTimeout(timer));
	};
	const ready = async () => {
		await initialize();
		if (!enabledMethod() || configuredMethod !== enabledMethod()?.id)
			throw new Error('SumUp is not set up for this store');
		return native();
	};
	const collectOnce = async (
		input: Parameters<PaymentDriver['collect']>[0]
	): Promise<CollectResult> => {
		const sdk = await ready();
		if ((await sdk.merchant().catch(rethrowPermissionError))?.merchantCode !== merchantCode)
			throw new Error(
				'SumUp account does not match this store. Use Connect Reader to log in again.'
			);
		await permissions();
		// While a session is active SumUp takes EVERY checkout offline, so a checkout first has
		// SumUp upload and end one this app started (offline tenders do not queue).
		if ((await offlineSession(sdk)).pending) await sdk.uploadOffline();
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
		// Approved on the reader only: the row settles when Pro finds the uploaded transaction.
		const provisional = result.offline === true;
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
					outcome: provisional ? 'authorized' : 'captured',
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
	};
	/** Online: SumUp uploads its offline payments, ends the session and refreshes its limits. */
	const syncOffline = (): Promise<void> | undefined => {
		if (collecting) {
			syncSkipped = true;
			return;
		}
		if (syncing || !online || !loggedIn) return;
		syncSkipped = false;
		syncing = (async () => {
			try {
				const sdk = await ready();
				if ((await offlineSession(sdk)).pending) await sdk.uploadOffline();
				if (optedIn()) await sdk.prepareOffline();
			} catch (error) {
				// The reader is still there; the next reconnect or online payment tries again.
				publish({ ...status, message: error instanceof Error ? error.message : String(error) });
			}
		})().finally(() => {
			syncing = null;
		});
		return syncing;
	};
	return {
		provider: 'sumup',
		capabilities: { discovery: 'sdk_ui', cancel: 'on_device', refund: false },
		initialize,
		refreshStatus,
		reportError,
		queuesOffline,
		/** The bridge reports the till's connectivity; back online, SumUp's offline payments upload. */
		setOnline(next: boolean) {
			online = next;
		},
		syncOffline,
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
				if ((await sdk.isLoggedIn()) && (await sdk.merchant())?.merchantCode !== merchantCode) {
					// SumUp uploads offline payments only under the account that took them.
					if ((await offlineSession(sdk)).pending) await sdk.uploadOffline();
					await sdk.logout();
				}
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
			if (input.transport !== 'bluetooth') throw new Error('SumUp requires a Bluetooth reader');
			collecting = true;
			try {
				await syncing;
				return await collectOnce(input);
			} finally {
				collecting = false;
				// A reconnect skipped during the checkout.
				if (syncSkipped) void syncOffline();
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
