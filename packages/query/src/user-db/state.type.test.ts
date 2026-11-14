import type { StateSlot } from './state';

function readonlySlotContract(
	slot: StateSlot<{ current: string | null }>
): string | null | undefined {
	// @ts-expect-error Persistence belongs to named commands, not read-only slots.
	void slot.set('current', () => null);
	return slot.get('current');
}
void readonlySlotContract;
