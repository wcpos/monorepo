import * as React from 'react';

import type { PaymentMethodDescriptor, PaymentTransport } from '@wcpos/order-math';

import { useStoreSession } from '../../../../contexts/app-state';
import { getDriver } from '../../../../services/payment-drivers/registry';
import { getTerminalPaymentsService } from '../../../../services/terminal-payments';
import { rememberedReaders } from '../../pos/checkout/tender/remembered-readers';
import { deviceTransports } from '../../pos/checkout/tender/tiles';

import type { ReaderInfo } from '../../../../services/payment-drivers/types';

/** A scan in progress or finished for one method: the found readers, or why it stopped. */
export type ReaderScan = {
	methodId: string;
	transport: PaymentTransport;
	readers: ReaderInfo[] | null;
};

/**
 * Reader maintenance for the Card readers settings page: scan, connect, disconnect, forget and
 * the provider's own reader UI. The pay sheet no longer does any of this (wcpos/roadmap#407).
 * Errors are kept per method as one message; the row shows it in one line.
 */
export function useReaderActions() {
	const { storeDB } = useStoreSession();
	const [scan, setScan] = React.useState<ReaderScan | null>(null);
	const [working, setWorking] = React.useState<string | null>(null);
	const [errors, setErrors] = React.useState<Readonly<Record<string, string>>>({});
	const live = React.useRef(true);
	React.useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	const run = React.useCallback(
		async (method: PaymentMethodDescriptor, operation: () => Promise<void>) => {
			if (working) return;
			setWorking(method.id);
			setErrors((prev) => ({ ...prev, [method.id]: '' }));
			try {
				await operation();
			} catch (error) {
				if (live.current)
					setErrors((prev) => ({
						...prev,
						[method.id]: error instanceof Error ? error.message : String(error),
					}));
			} finally {
				if (live.current) setWorking(null);
			}
		},
		[working]
	);
	const start = React.useCallback(
		(method: PaymentMethodDescriptor, transport?: PaymentTransport) =>
			run(method, async () => {
				const driver = getDriver(method.capture.provider);
				if (driver?.capabilities.discovery === 'sdk_ui') {
					await driver.openReaderSettings?.();
					return;
				}
				const chosen =
					transport ??
					deviceTransports(method).find((item) => item.transport !== 'tap_to_pay')?.transport ??
					deviceTransports(method)[0]?.transport;
				if (!driver?.discoverReaders || !chosen)
					throw new Error('This provider has no reader driver');
				setScan({ methodId: method.id, transport: chosen, readers: null });
				const readers = await driver.discoverReaders(chosen);
				if (live.current) setScan({ methodId: method.id, transport: chosen, readers });
			}),
		[run]
	);
	const connect = React.useCallback(
		(method: PaymentMethodDescriptor, reader: ReaderInfo) =>
			run(method, async () => {
				const driver = getDriver(method.capture.provider);
				if (!driver?.connect) throw new Error('This provider has no reader driver');
				const service = getTerminalPaymentsService();
				if (!service) throw new Error('Connecting a reader needs a connection to the store');
				// The choice is made: the list goes, the row says "Connecting to…" or why it did not.
				setScan(null);
				const handoff = await service.bootstrap(method.id, { transport: reader.transport });
				await driver.connect(reader, { ...handoff, method_id: method.id });
				await rememberedReaders(storeDB).set(method.id, reader);
			}),
		[run, storeDB]
	);
	const cancelScan = React.useCallback(() => setScan(null), []);
	const disconnect = React.useCallback(
		(method: PaymentMethodDescriptor) =>
			run(method, async () => {
				await getDriver(method.capture.provider)?.disconnect?.();
			}),
		[run]
	);
	// Forget asks first (the Printers and Customer display pages do the same).
	const [pendingForget, setPendingForget] = React.useState<PaymentMethodDescriptor | null>(null);
	// The dialog is open while `pendingForget` is set; `forgetTarget` outlives it so the title
	// keeps naming the reader through the exit animation instead of reading "Forget ?".
	const [forgetTarget, setForgetTarget] = React.useState<PaymentMethodDescriptor | null>(null);
	const askForget = React.useCallback((method: PaymentMethodDescriptor) => {
		setForgetTarget(method);
		setPendingForget(method);
	}, []);
	const cancelForget = React.useCallback(() => setPendingForget(null), []);
	const confirmForget = React.useCallback(() => {
		const method = pendingForget;
		setPendingForget(null);
		if (!method) return;
		void run(method, async () => {
			const driver = getDriver(method.capture.provider);
			// A held SDK session must go with the memory, or the next scan is refused.
			await driver?.disconnect?.().catch(() => undefined);
			await rememberedReaders(storeDB).remove(method.id);
		});
	}, [pendingForget, run, storeDB]);
	/** Dev-only simulated-reader controls run through the same error line as everything else. */
	const runDev = run;
	return {
		scan,
		working,
		errors,
		start,
		connect,
		cancelScan,
		disconnect,
		pendingForget,
		forgetTarget,
		askForget,
		cancelForget,
		confirmForget,
		runDev,
	};
}
export type ReaderActions = ReturnType<typeof useReaderActions>;
