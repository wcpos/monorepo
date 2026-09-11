import type {
	CollectResult,
	DriverStatus,
	OfflineSettlement,
	PaymentDriver,
	ReaderInfo,
} from '@wcpos/core/services/payment-drivers/types';
import {
	fromMinor,
	type PaymentMethodDescriptor,
	type PaymentTransport,
	toMinor,
} from '@wcpos/order-math';

import type {
	PaymentIntent,
	Reader,
	UserCallbacks,
	useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';

export type Sdk = ReturnType<typeof useStripeTerminal>;
export type Bootstrap = (methodId: string) => Promise<Record<string, unknown>>;
type SdkError = {
	code: string;
	message: string;
	declineCode?: string;
	apiError?: { declineCode?: string };
};
let provideToken: (() => Promise<string>) | undefined;
// The provider must see the same function identity on every render.
export async function tokenProvider(): Promise<string> {
	if (!provideToken) throw new Error('Stripe Terminal is not enabled on this store');
	return provideToken();
}
const discoveryMethod = (transport: PaymentTransport) =>
	transport === 'tap_to_pay' ? 'tapToPay' : 'bluetoothScan';
const readerInfo = (reader: Reader.Type, transport: PaymentTransport): ReaderInfo => ({
	id: reader.serialNumber,
	label: `${reader.deviceType} ${reader.serialNumber}`,
	model: reader.deviceType,
	serial: reader.serialNumber,
	// The SDK reports the level as a 0–1 fraction; the status line shows a percentage.
	battery: reader.batteryLevel == null ? null : Math.round(reader.batteryLevel * 100),
	transport,
});

export function createStripeTerminalDriver({
	bootstrap,
	resolveMethod,
}: {
	bootstrap: Bootstrap;
	resolveMethod: () => PaymentMethodDescriptor | null;
}) {
	let sdk: Sdk | null = null;
	let initialize: (() => Promise<void>) | null = null;
	const offlineIds = new Map<string, string>();
	let status: DriverStatus = { connection: 'disconnected', reader: null };
	let permissionDenied = false;
	let bluetoothOff = false;
	let lastMethodId: string | undefined;
	let lastProviderData: Record<string, unknown> = {};
	let transport: PaymentTransport = 'bluetooth';
	let readers: Reader.Type[] = [];
	let finishDiscovery: ((error?: SdkError) => void) | undefined;
	const listeners = new Set<(s: DriverStatus) => void>();
	const settlements = new Set<(e: OfflineSettlement) => void>();
	const bindings = new Set<(api: Sdk) => void>();
	const publish = (next: Partial<DriverStatus>) => {
		status = { ...status, ...next };
		listeners.forEach((listener) => listener(status));
	};
	const reportError = (error: SdkError) => {
		if (/bluetooth/i.test(error.code)) bluetoothOff = true;
		publish({ message: error.message });
		return new Error(error.message);
	};
	const check = (result: { error?: SdkError } | undefined) => {
		if (!result) throw new Error('Stripe Terminal returned no result');
		if (result.error) throw reportError(result.error);
	};
	const ready = async (): Promise<Sdk> => {
		if (!sdk) await initialize?.();
		return sdk
			? Promise.resolve(sdk)
			: new Promise((resolve, reject) => {
					const bind = (api: Sdk) => {
						clearTimeout(timer);
						bindings.delete(bind);
						resolve(api);
					};
					const timer = setTimeout(() => {
						bindings.delete(bind);
						reject(new Error('Stripe Terminal is not ready'));
					}, 10000);
					bindings.add(bind);
				});
	};
	const cancelDiscovery = async (api: Sdk) => {
		const active = Boolean(finishDiscovery);
		finishDiscovery?.();
		const result = await api.cancelDiscovering();
		// iOS reports an already-completed command when there is nothing left to cancel.
		const error: SdkError | undefined = result.error;
		if (error?.code === 'CancelFailedAlreadyCompleted') return;
		if (!active && error?.code === 'CANCEL_FAILED') return;
		check(result);
	};
	const nextToken = async () => {
		const id = lastMethodId ?? resolveMethod()?.id;
		if (!id) throw new Error('Stripe Terminal is not enabled on this store');
		const fresh = (await bootstrap(id)).connection_token;
		if (typeof fresh !== 'string' || !fresh) throw new Error('No Stripe Terminal connection token');
		return fresh;
	};
	// Initialization requests a token before an SDK binding or reader connection exists.
	provideToken = nextToken;
	const connected = (reader?: Reader.Type) => {
		bluetoothOff = false;
		publish({
			connection: 'connected',
			reader: reader ? readerInfo(reader, transport) : status.reader,
			progress: null,
			pairingCode: null,
			message: null,
		});
	};
	const disconnected = (message: string | null = null) =>
		publish({
			connection: 'disconnected',
			reader: null,
			progress: null,
			pairingCode: null,
			message,
		});
	const callbacks = {
		onUpdateDiscoveredReaders: (next: Reader.Type[]) => {
			readers = next;
		},
		onFinishDiscoveringReaders: (error?: SdkError) => finishDiscovery?.(error),
		onDidChangeConnectionStatus: (connection: Reader.ConnectionStatus) => {
			if (connection === 'notConnected') disconnected();
			else if (connection === 'connected') connected(sdk?.connectedReader ?? undefined);
			else publish({ connection: connection === 'reconnecting' ? 'connecting' : connection });
		},
		onDidStartInstallingUpdate: () => publish({ connection: 'updating', progress: null }),
		onDidReportReaderSoftwareUpdateProgress: (value: string) => {
			const progress = Number.parseFloat(value);
			publish({
				connection: 'updating',
				progress: Number.isFinite(progress) ? progress / (value.includes('%') ? 100 : 1) : null,
			});
		},
		onDidFinishInstallingUpdate: (result: { error?: SdkError }) => {
			if (result.error) {
				reportError(result.error);
				publish({ connection: 'disconnected', reader: null });
			} else publish({ connection: 'connecting', progress: null });
		},
		onDidRequestReaderDisplayMessage: (message: Reader.DisplayMessage) => publish({ message }),
		onDidRequestReaderInput: (inputs: Reader.InputOptions[]) =>
			publish({ message: inputs.join(', ') }),
		// Reserved for SDKs/readers that surface a pairing code; beta.32 has no such callback.
		onDidRequestReaderPairingCode: (pairingCode: string) => publish({ pairingCode }),
		onDidUpdateBatteryLevel: ({ batteryLevel }: Reader.BatteryLevel) => {
			if (status.reader)
				publish({
					reader: {
						...status.reader,
						battery: batteryLevel == null ? null : Math.round(batteryLevel * 100),
					},
				});
		},
		onDidDisconnect: (reason?: Reader.DisconnectReason) => {
			if (reason === 'bluetoothDisabled') bluetoothOff = true;
			const messages: Partial<Record<Reader.DisconnectReason, string>> = {
				poweredOff: 'Reader powered off',
				idlePowerDown: 'Reader powered off',
				bluetoothDisabled: 'Bluetooth is off',
				bluetoothSignalLost: 'Reader out of range',
				criticallyLowBattery: 'Reader battery is empty',
				rebootRequested: 'Reader restarting',
				securityReboot: 'Reader restarting',
				usbDisconnected: 'Reader unplugged',
			};
			disconnected(messages[reason ?? 'unknown'] ?? 'Reader disconnected');
		},
		onDidStartReaderReconnect: (reader: Reader.Type) =>
			publish({
				connection: 'connecting',
				reader: readerInfo(reader, transport),
				message: 'Reconnecting to reader',
			}),
		onDidSucceedReaderReconnect: (reader: Reader.Type) => {
			connected(reader);
			publish({ message: 'Reader reconnected' });
		},
		onDidFailReaderReconnect: () => disconnected('Reader reconnect failed'),
		onDidChangeOfflineStatus: (
			offline: Parameters<NonNullable<UserCallbacks['onDidChangeOfflineStatus']>>[0]
		) =>
			publish({
				message: offline.sdk.networkStatus === 'offline' ? 'Stripe Terminal is offline' : null,
			}),
		onDidForwardPaymentIntent: (pi: PaymentIntent.Type, error?: SdkError) => {
			if (error) {
				reportError(error);
				return;
			}
			const rowId = pi.metadata?.wcpos_payment_id;
			if (!rowId || !pi.id) return;
			offlineIds.delete(rowId);
			settlements.forEach((listener) =>
				listener({
					rowId,
					provider_refs: { payment_intent: pi.id, charge: pi.charges?.[0]?.id ?? null },
				})
			);
		},
		onDidForwardingFailure: (error?: SdkError) =>
			publish({ message: error?.message ?? 'Offline payment forwarding failed' }),
	} satisfies UserCallbacks & { onDidRequestReaderPairingCode: (code: string) => void };
	const driver = {
		provider: 'stripe',
		capabilities: { discovery: 'harness', cancel: 'app', refund: false },
		availability: (): ReturnType<PaymentDriver['availability']> =>
			permissionDenied
				? { available: false, reason: 'permission' }
				: bluetoothOff
					? { available: false, reason: 'bluetooth_off' }
					: { available: true },
		callbacks,
		reportError,
		requestInitialization: () => initialize?.() ?? Promise.resolve(),
		setInitializationHandler: (handler: (() => Promise<void>) | null) => {
			initialize = handler;
		},
		setPermissionDenied: (denied: boolean) => {
			permissionDenied = denied;
			publish({});
		},
		bindSdk: (api: Sdk | null) => {
			if (api && !sdk) publish({ message: null });
			sdk = api;
			if (api) {
				bindings.forEach((bind) => bind(api));
			} else lastMethodId = undefined;
		},
		async discoverReaders(nextTransport: PaymentTransport): Promise<ReaderInfo[]> {
			const api = await ready();
			await cancelDiscovery(api);
			// The SDK refuses to scan while a reader is connected ("Already connected to a
			// reader"); a new search is the cashier changing readers, so let go of the current one.
			if (status.connection === 'connected') {
				check(await api.disconnectReader());
				disconnected();
			}
			transport = nextTransport;
			readers = [];
			bluetoothOff = false;
			publish({ connection: 'discovering', message: null });
			return new Promise((resolve, reject) => {
				const finish = (error?: SdkError) => {
					if (finishDiscovery !== finish) return;
					finishDiscovery = undefined;
					clearTimeout(timer);
					publish({ connection: status.reader ? 'connected' : 'disconnected' });
					if (error && error.code !== 'Canceled') reject(reportError(error));
					else {
						const found = readers.map((reader) => readerInfo(reader, nextTransport));
						if (__DEV__)
							console.log(
								'[stripe-driver] discovered',
								found.map((item) => item.label)
							);
						resolve(found);
					}
				};
				const timer = setTimeout(() => {
					finish();
					void api
						.cancelDiscovering()
						.then(check)
						.catch((error: Error) => publish({ message: error.message }));
				}, 10000);
				finishDiscovery = finish;
				const method = resolveMethod();
				const simulated = __DEV__ && (method?.provider_data ?? lastProviderData).test_mode === true;
				if (__DEV__)
					console.log('[stripe-driver] discover', {
						transport: nextTransport,
						method: method?.id ?? null,
						testMode: (method?.provider_data ?? lastProviderData).test_mode === true,
						hasLocation: Boolean((method?.provider_data ?? lastProviderData).location_id),
						simulated,
					});
				void api
					.discoverReaders({
						discoveryMethod: discoveryMethod(nextTransport),
						simulated,
					})
					.then(({ error }: { error?: SdkError }) => {
						if (error) finish(error);
					})
					.catch((error: Error) => {
						finish({ code: 'DiscoveryError', message: error.message });
					});
			});
		},
		async connect(reader: ReaderInfo, handoff: Record<string, unknown> | null): Promise<void> {
			if (handoff === null)
				throw reportError({
					code: 'StoreOffline',
					message: 'Reconnecting needs a connection to the store',
				});
			if (typeof handoff?.location_id !== 'string' || !handoff.location_id)
				throw new Error('This gateway has no Terminal location');
			lastMethodId = typeof handoff.method_id === 'string' ? handoff.method_id : undefined;
			const api = await ready();
			await cancelDiscovery(api);
			const sdkReader = readers.find((item) => item.serialNumber === reader.id);
			if (!sdkReader) throw new Error('Discover this Stripe Terminal reader again');
			transport = reader.transport;
			publish({
				connection: 'connecting',
				reader,
				progress: null,
				pairingCode: null,
				message: null,
			});
			const result = await api.connectReader(
				reader.transport === 'tap_to_pay'
					? { discoveryMethod: 'tapToPay', reader: sdkReader, locationId: handoff.location_id }
					: {
							discoveryMethod: 'bluetoothScan',
							reader: sdkReader,
							locationId: handoff.location_id,
							autoReconnectOnUnexpectedDisconnect: true,
						}
			);
			if (result.error) {
				disconnected();
				throw reportError(result.error);
			}
			connected(result.reader);
		},
		async collect(input: Parameters<PaymentDriver['collect']>[0]): Promise<CollectResult> {
			lastProviderData = input.method.provider_data;
			const api = await ready();
			const dp = input.dp;
			const failed = (
				outcome: 'cancelled' | 'declined',
				failure_reason?: string
			): CollectResult => ({
				outcome,
				failure_reason,
				provider_refs: {},
				receipt: {},
				amount: null,
				transport: input.transport,
			});
			const paymentIntent = (result: { paymentIntent?: PaymentIntent.Type; error?: SdkError }) => {
				if (result.error) throw result.error;
				if (!result.paymentIntent) throw new Error('Stripe Terminal returned no payment intent');
				return result.paymentIntent;
			};
			let confirming = false;
			try {
				const secret = input.handoff?.client_secret;
				if (!input.offline && (typeof secret !== 'string' || !secret))
					throw new Error('No Stripe payment intent client secret');
				const initial = paymentIntent(
					input.offline
						? await api.createPaymentIntent({
								amount: toMinor(input.row.amount, dp),
								currency: input.row.currency.toLowerCase(),
								captureMethod: 'automatic',
								offlineBehavior: 'force_offline',
								metadata: { wcpos_payment_id: input.row.id },
							})
						: await api.retrievePaymentIntent(secret as string)
				);
				// Only readers with a screen take a tip on the reader (WisePad 3, WisePOS E, S700/S710);
				// the M2 and Chipper refuse a tipping configuration outright
				// (UNSUPPORTED_OPERATION "Tipping configuration provided with incompatible reader").
				const tipCapable = /wisePad3|wisePosE|stripeS7/i.test(status.reader?.model ?? '');
				const tipEligibleAmount = tipCapable ? (input.tipEligibleMinor ?? undefined) : undefined;
				const collected = paymentIntent(
					await api.collectPaymentMethod({
						paymentIntent: initial,
						tipEligibleAmount,
						skipTipping: tipEligibleAmount == null,
					})
				);
				confirming = true;
				const confirmed = paymentIntent(
					await api.confirmPaymentIntent({ paymentIntent: collected })
				);
				const charge = confirmed.charges?.[0];
				const offlineDetails = confirmed.offlineDetails as typeof confirmed.offlineDetails & {
					id?: string;
				};
				if (input.offline && offlineDetails?.id) offlineIds.set(input.row.id, offlineDetails.id);
				// beta.32 uses cardPresentDetails; also accept the handoff contract's cardPresent spelling.
				const details = charge?.paymentMethodDetails;
				const card =
					details?.cardPresentDetails ??
					(
						details as
							| {
									cardPresent?: { brand?: string; last4?: string; funding?: string };
							  }
							| undefined
					)?.cardPresent;
				const receipt = card
					? {
							brand: card.brand,
							last4: card.last4,
							...(card.funding ? { funding: card.funding } : {}),
						}
					: {};
				return {
					outcome: input.offline ? 'authorized' : 'captured',
					provider_refs: input.offline
						? { payment_intent: null }
						: { payment_intent: confirmed.id, charge: charge?.id ?? null },
					receipt,
					amount: input.offline ? input.row.amount : fromMinor(confirmed.amount, dp),
					transport: input.transport,
				};
			} catch (error) {
				const failure = error as SdkError;
				if (__DEV__)
					console.log('[stripe-driver] collect failed', {
						code: failure.code,
						message: failure.message,
						declineCode: failure.declineCode ?? failure.apiError?.declineCode ?? null,
						confirming,
						handoffKeys: Object.keys(input.handoff ?? {}),
					});
				if (failure.code === 'Canceled') return failed('cancelled');
				const decline = failure.declineCode ?? failure.apiError?.declineCode;
				if (confirming && (decline || failure.code === 'DeclinedByStripeAPI'))
					return failed('declined', decline ?? 'card_declined');
				throw new Error(failure.message);
			}
		},
		async cancel(): Promise<void> {
			check(await (await ready()).cancelCollectPaymentMethod());
		},
		async disconnect(): Promise<void> {
			check(await (await ready()).disconnectReader());
			disconnected();
		},
		status$: {
			get: () => status,
			subscribe: (listener: (s: DriverStatus) => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		settleOffline$: {
			subscribe: (listener: (e: OfflineSettlement) => void) => {
				settlements.add(listener);
				return () => {
					settlements.delete(listener);
				};
			},
		},
	} satisfies PaymentDriver & Record<string, unknown>;
	return driver;
}
