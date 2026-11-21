import type { SlotWrite } from '../commands/cart-command';

export interface IncrementFold {
	delta: number;
	applied: number;
	outcome: Promise<Awaited<ReturnType<SlotWrite>> | undefined | false>;
}
export const incrementFolds = new Map<string, IncrementFold>();
export function resetIncrementFolds() {
	incrementFolds.clear();
}

/** Any enqueued write closes the order's folds so later presses queue behind it (#3379). */
export function closeIncrementFolds(orderId: string): void {
	for (const key of incrementFolds.keys()) {
		if (key.startsWith(`${orderId}:`)) incrementFolds.delete(key);
	}
}
