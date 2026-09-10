import { fromMinor, toMinor } from '@wcpos/order-math';
import { log } from '@wcpos/utils/logger';

import type {
	CollectResult,
	DriverStatus,
	OfflineSettlement,
	PaymentDriver,
	ReaderInfo,
} from './types';

export function createSimulatedDriver({
	fetch = globalThis.fetch,
}: { fetch?: typeof globalThis.fetch } = {}): PaymentDriver {
	let status: DriverStatus = { connection: 'disconnected', reader: null };
	const listeners = new Set<(s: DriverStatus) => void>();
	const settlements = new Set<(e: OfflineSettlement) => void>();
	const outcomeUrls = new Map<string, string>();
	let cancelCollection: (() => void) | null = null;
	const publish = (next: DriverStatus) => {
		status = next;
		listeners.forEach((fn) => fn(status));
	};
	const readers: ReaderInfo[] = ['approve', 'decline', 'cancel', 'tip', 'offline', 'tap'].map(
		(name) => ({
			id: `sim-${name}`,
			label: `Simulated ${name}`,
			model: 'Simulated reader',
			battery: 82,
			transport: name === 'tap' ? 'tap_to_pay' : 'bluetooth',
		})
	);
	return {
		provider: 'simulated',
		capabilities: { discovery: 'harness', cancel: 'app', refund: false },
		availability: () => ({ available: true }),
		discoverReaders: async (transport) =>
			readers.filter((reader) => reader.transport === transport),
		connect: async (reader) => {
			publish({ connection: 'connecting', reader });
			await new Promise<void>((resolve) => setTimeout(resolve, 300));
			publish({ connection: 'connected', reader });
		},
		disconnect: async () => {
			publish({ connection: 'disconnected', reader: null });
		},
		collect: (input) => {
			if (status.connection !== 'connected' || !status.reader)
				return Promise.reject(new Error('No reader connected'));
			if (cancelCollection) return Promise.reject(new Error('Reader is in use'));
			const id = status.reader.id;
			const outcomeUrl =
				typeof input.handoff?.outcome_url === 'string' ? input.handoff.outcome_url : null;
			if (!input.offline && outcomeUrl !== null) outcomeUrls.set(input.row.id, outcomeUrl);
			const dp = input.row.amount.split('.')[1]?.length ?? 0;
			const amount =
				id === 'sim-tip' && input.tipEligibleMinor !== null
					? fromMinor(toMinor(input.row.amount, dp) + Math.round(input.tipEligibleMinor / 10), dp)
					: input.row.amount;
			const postOutcome = async (url: string | null, outcome: CollectResult['outcome']) => {
				if (url === null) return;
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						outcome:
							outcome === 'declined'
								? 'failed'
								: outcome === 'cancelled'
									? 'canceled'
									: 'succeeded',
						amount: outcome === 'captured' && id === 'sim-tip' ? amount : null,
						failure_reason: outcome === 'declined' ? 'card_declined' : null,
					}),
				});
				if (!response.ok) throw new Error(`Simulated outcome POST failed: HTTP ${response.status}`);
			};
			return new Promise<CollectResult>((resolve, reject) => {
				let timer: ReturnType<typeof setTimeout>;
				const finish = async (outcome: CollectResult['outcome']) => {
					clearTimeout(timer);
					cancelCollection = null;
					try {
						if (!input.offline) await postOutcome(outcomeUrl, outcome);
					} catch (error) {
						reject(error instanceof Error ? error : new Error(String(error)));
						return;
					}
					const refs = {
						payment_intent: outcome === 'authorized' ? null : `sim_pi_${input.row.id}`,
					};
					resolve({
						outcome,
						provider_refs: refs,
						receipt: { brand: 'visa', last4: '4242' },
						amount,
						transport: input.transport,
						...(outcome === 'declined' ? { failure_reason: 'card_declined' } : {}),
					});
					if (outcome === 'authorized') {
						const settlementUrl = outcomeUrls.get(input.row.id) ?? null;
						setTimeout(() => {
							void postOutcome(settlementUrl, 'captured')
								.then(() => {
									settlements.forEach((fn) =>
										fn({
											rowId: input.row.id,
											provider_refs: { payment_intent: `sim_pi_${input.row.id}` },
										})
									);
									outcomeUrls.delete(input.row.id);
								})
								.catch((error: unknown) => {
									log.warn(`Simulated offline settlement failed: ${String(error)}`);
								});
						}, 3000);
					}
				};
				cancelCollection = () => {
					void finish('cancelled');
				};
				timer = setTimeout(() => {
					if (id === 'sim-cancel') return;
					void finish(
						id === 'sim-decline'
							? 'declined'
							: id === 'sim-offline' && input.offline
								? 'authorized'
								: 'captured'
					);
				}, 500);
			});
		},
		cancel: async () => {
			cancelCollection?.();
		},
		status$: {
			get: () => status,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		settleOffline$: {
			subscribe: (listener) => {
				settlements.add(listener);
				return () => {
					settlements.delete(listener);
				};
			},
		},
	};
}
