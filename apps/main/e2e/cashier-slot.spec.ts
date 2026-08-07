import { expect, test } from '@playwright/test';

import { selectCashierSlot } from './cashier-slot';

test('selects a stable 1..8 cashier slot from the run and shard', () => {
	expect(selectCashierSlot('123456', 1)).toBe(3);
	expect(selectCashierSlot('123456', 1)).toBe(3);
	expect(selectCashierSlot('123456', 2)).toBe(4);
	expect(selectCashierSlot('987654', 1)).toBe(5);
});
