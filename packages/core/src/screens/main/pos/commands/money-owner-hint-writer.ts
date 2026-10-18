import { paymentsContractAtLeast } from '@wcpos/order-math';
import type { useQueryRuntime } from '@wcpos/query';
import type { MetaDataEntry } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';

import { enqueueOrderMutation } from '../hooks/order-mutation-queue';

import type { MutationDocument } from '../../hooks/mutations/use-local-mutation';

const logger = getLogger(['wcpos', 'pos', 'money-owner']);

/** Persist ownership even when no POS screen is mounted. */
export function createMoneyOwnerHintWriter(
	manager: ReturnType<typeof useQueryRuntime>,
	deps: { storeContract: () => string | null }
) {
	let pending = new Set<string>();
	const unsubscribe = manager.engine.events((event) => {
		if (event.type === 'scope-switched') {
			pending = new Set();
			return;
		}
		if (event.type !== 'order-money-divergence') return;
		if (paymentsContractAtLeast(deps.storeContract(), '1.3')) {
			logger.debug('Server stamps money ownership at payments contract 1.3');
			return;
		}
		const orderId = event.recordId;
		if (!orderId || pending.has(orderId)) return;
		const pendingOwnership = pending;
		pending.add(orderId);
		void enqueueOrderMutation(orderId, async () => {
			if (pending !== pendingOwnership) return;
			// Lazy: `plain-patch` reaches `uuid` (ESM-only), which jest cannot require from the
			// many suites that import this bridge; the write is rare and already async.
			const { findEngineResident, plainPatch } = await import('./plain-patch');
			const document = await findEngineResident(manager, 'orders', orderId);
			if (!document) return;
			await plainPatch(manager, 'orders', {
				document: document as unknown as MutationDocument,
				changes: (payload) => {
					if (pending !== pendingOwnership) return {};
					const meta = (payload.meta_data ?? []) as MetaDataEntry[];
					const hint = meta.find(({ key }) => key === '_wcpos_money_owner_hint');
					if (hint?.value === 'server') return {};
					return {
						meta_data: hint
							? meta.map((entry) => (entry === hint ? { ...entry, value: 'server' } : entry))
							: [...meta, { key: '_wcpos_money_owner_hint', value: 'server' }],
					};
				},
			});
		})
			.catch((error) =>
				logger.warn('Failed to persist server money ownership', { context: { orderId, error } })
			)
			.finally(() => pendingOwnership.delete(orderId));
	});
	return () => {
		pending = new Set();
		unsubscribe();
	};
}
