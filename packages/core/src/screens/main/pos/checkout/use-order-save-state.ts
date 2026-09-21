import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { type OrderSaveState, useCheckoutMode } from './checkout-mode';

// Kept out of `checkout-mode.ts` on purpose: the store is imported by half the POS and
// `useOnlineStatus` pulls the native NetInfo module, which every suite that touches the
// store would then have to mock.
/**
 * The store entry, with one derivation: a save still `saving` while the till is offline reads as
 * `queued-offline`. The engine's connectivity port is pull-only and its status only notices a flip
 * on the next automatic tick, so without this the pane would keep its skeletons for up to a tick
 * after the network dropped. Only `'offline'` flips it; `'online-website-unavailable'` stays
 * `saving` because that is exactly the "store is not answering" case. The pending settlement is
 * untouched and still resolves on engine events (roadmap#171).
 */
export function useOrderSaveState(uuid: string | undefined): OrderSaveState | null {
	const mode = useCheckoutMode();
	const { status } = useOnlineStatus();
	const state = uuid === undefined ? null : (mode.saveStates.get(uuid) ?? null);
	return state?.kind === 'saving' && status === 'offline'
		? { kind: 'queued-offline', mutationId: '' }
		: state;
}
export function useOrderSaving(uuid: string | undefined): boolean {
	return useOrderSaveState(uuid)?.kind === 'saving';
}
