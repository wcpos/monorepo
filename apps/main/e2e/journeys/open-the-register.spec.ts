/**
 * roadmap#539: J1 "Open the register and run the session", walking `open-the-register.ts`.
 *
 * The register wire is stubbed (`stubRegisterWire`): a register is a singleton on the store, and
 * two PRs' E2E runs overlap on dev-pro, so real sessions there would fight each other and leave
 * closures behind. The stub records what the app pushed; these tests assert those writes.
 */
import { expect, type Page } from '@playwright/test';

import { CAPTURE_DEVICES } from '../capture-matrix';
import { decimalPlaces, digitsOf } from '../checkout-shared';
import { authenticatedTest } from '../fixtures';
import { CLOSE_PUSH_TIMEOUT_MS } from './open-register';
import {
	openTheRegister,
	type OpenTheRegisterContext,
	openWithFloat,
	payIn,
	REGISTER_PUSH_TIMEOUT_MS,
	seeCashierSheet,
	seeClosed,
} from './open-the-register';
import { type RegisterWrites, stubRegisterWire } from './register-wire-stub';

const test = authenticatedTest.extend<{ registerWire: { page: Page; writes: RegisterWrites } }>({
	registerWire: async ({ page }, use, testInfo) => {
		const writes = await stubRegisterWire(page, testInfo);
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
		await use({ page, writes });
		// Routes stay armed after the last assertion; a late fetch would otherwise abort the run.
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	},
});

/** One session, the three movements with their types and amounts, one closure of that session. */
function expectSessionWrites(writes: RegisterWrites) {
	expect(writes.sessions, 'one session pushed').toHaveLength(1);
	expect(writes.sessions[0].counted_float, 'the session opens on the float').toBe('100');
	expect(
		writes.movements.map(({ type, amount }) => ({ type, amount: Number(amount) })),
		'pay in, pay out, no sale, in that order'
	).toEqual([
		{ type: 'paid_in', amount: 20 },
		{ type: 'paid_out', amount: 5 },
		{ type: 'no_sale', amount: 0 },
	]);
	expect(writes.closures, 'one closure pushed').toHaveLength(1);
	expect(writes.closures[0].session_id, 'the closure closes that session').toBe(
		writes.sessions[0].id
	);
	// To the second: the server keeps `opened_at_gmt` without a fraction, and the app's closure
	// reads the acknowledged row (`isoGmt`), so `.123Z` comes back as `.000Z`.
	const second = (value: unknown) => Math.floor(Date.parse(String(value)) / 1000);
	expect(second(writes.closures[0].opened_at), 'the closure opens when the session did').toBe(
		second(writes.sessions[0].opened_at)
	);
}

test.describe('J1 Open the register and run the session', () => {
	// The walk holds for two pushes: the session (one tick) and the closure (up to two).
	test.describe.configure({ timeout: REGISTER_PUSH_TIMEOUT_MS + CLOSE_PUSH_TIMEOUT_MS + 180_000 });

	test('the session runs from float to closure', async ({ registerWire }, testInfo) => {
		const { page, writes } = registerWire;
		await openTheRegister({ page, testInfo });
		expectSessionWrites(writes);
	});

	test.describe('on a phone', () => {
		test.use({ viewport: CAPTURE_DEVICES.phone });

		test('the session runs from float to closure on a phone', async ({
			registerWire,
		}, testInfo) => {
			const { page, writes } = registerWire;
			const walk = await openTheRegister({ page, testInfo });
			expect(walk.layout).toBe('phone');
			expectSessionWrites(writes);
		});
	});

	test('a pay in can be undone from its toast', async ({ registerWire }, testInfo) => {
		const { page, writes } = registerWire;
		const ctx: OpenTheRegisterContext = { page, testInfo };
		const walk = await seeClosed(ctx);
		await openWithFloat(ctx, walk);
		await seeCashierSheet(ctx, walk);
		await payIn(ctx);
		// Step 4 does not hold for its push, so its toast is still up. Undo voids the movement, the
		// same void as the row's button.
		await page.getByTestId('toast-undo').click();
		await expect(page.getByTestId('register-panel'), 'Undo leaves the panel open').toBeVisible();
		const drawer = page.getByTestId('register-panel-drawer');
		await expect
			.poll(
				async () => {
					const text = (await drawer.textContent()) ?? '';
					return Number(digitsOf(text)) - 100 * 10 ** decimalPlaces(text);
				},
				{ message: 'the drawer holds the float again', timeout: 15_000 }
			)
			.toBe(0);
		await expect
			.poll(() => writes.movements.length, {
				message: 'the pay in and its void reach the store',
				timeout: REGISTER_PUSH_TIMEOUT_MS,
			})
			.toBe(2);
		const [payInRow, voidRow] = writes.movements;
		expect(payInRow.type, 'the pay in lands first').toBe('paid_in');
		expect(voidRow.voids, 'the void names the pay in').toBe(payInRow.id);
	});
});
