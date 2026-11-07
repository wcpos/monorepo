/**
 * J1 "Open the register" as a shared start state for other journeys: this is J1's first step
 * only. The full J1 journey module (count in, float, close) is a later ticket (roadmap#514).
 */
import { expect, type Page, test } from '@playwright/test';

import { becomesVisible, ensureRegisterOpen } from '../fixtures';
import { cashInputs } from './cash-figure';

/** Phone when the tab bar's Products tab is on screen, else the columns layout. */
export async function posLayout(page: Page): Promise<'phone' | 'columns'> {
	const phoneTab = page.getByTestId('pos-tab-products').filter({ visible: true });
	const columns = page.getByTestId('pos-products-panel').filter({ visible: true });
	await expect(phoneTab.or(columns).first()).toBeVisible({ timeout: 30_000 });
	return (await phoneTab.count()) > 0 ? 'phone' : 'columns';
}

/**
 * On a phone the cart and the products grid are separate tabs, and both stay mounted, so a pane
 * can count as visible while off-screen. Tap until the tab reports selected.
 */
export async function showPhoneTab(page: Page, tab: 'products' | 'cart'): Promise<void> {
	const button = page.getByTestId(`pos-tab-${tab}`).filter({ visible: true });
	await expect(async () => {
		await button.click({ timeout: 5_000 });
		await expect(button).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
	}).toPass({ timeout: 30_000 });
}

/**
 * J1 "Open the register" as a shared start state for other journeys. Resolves true only when this
 * call opened the session; a caller on a shared store closes what it opened with `closeRegister`.
 */
export async function openRegister(page: Page): Promise<boolean> {
	return test.step('Open the register', async () => {
		// The register card lives in the cart, which a phone shows on its Cart tab.
		const phone = (await posLayout(page)) === 'phone';
		if (phone) await showPhoneTab(page, 'cart');
		// Idempotent: an already-open register resolves on its ready cart header. Choosing a
		// register takes a phone back to Products, with the card still mounted off-screen.
		return ensureRegisterOpen(page, {
			afterPicking: phone ? () => showPhoneTab(page, 'cart') : undefined,
		});
	});
}

/** The app pushes a closure on its 60 s session tick, which can restart: two ticks and a margin. */
const CLOSE_PUSH_TIMEOUT_MS = 150_000;

/**
 * Close the session through the register's one door (avatar, cashier sheet, In the drawer), as
 * register-closure.spec.ts does, counting exactly what the drawer expects so a closure on a shared
 * store never records a variance: `count-exact` must show before anything is closed. A blind
 * cashier is shown no expected cash, and that fails here rather than guessing a count. Resolves
 * only once the server accepted the closure: the app pushes it on a 60 s tick, only while the page
 * is alive, so the page stays open until then or the shared store keeps an open session.
 */
export async function closeRegister(page: Page): Promise<void> {
	await test.step('Close the register', async () => {
		// The phone mounts a register bar per tab, both "visible", one off-screen: press the
		// avatar that is on screen (forced, as in register-captures.spec.ts, as the bars stack).
		if ((await posLayout(page)) === 'phone') await showPhoneTab(page, 'cart');
		const width = page.viewportSize()?.width ?? 0;
		const door = page.getByTestId('user-sheet-drawer');
		// A toast can eat the press, and stays while hovered: retry with the mouse moved off it, but
		// not while the door shows (that would close the sheet).
		await expect(async () => {
			if (await door.isVisible()) return;
			for (const avatar of await page.getByTestId('register-bar-avatar').all()) {
				const box = await avatar.boundingBox();
				if (box && box.x >= 0 && box.x < width) {
					await avatar.click({ force: true, timeout: 5_000 });
					break;
				}
			}
			await page.mouse.move(0, 0);
			await expect(door).toBeVisible({ timeout: 3_000 });
		}).toPass({ timeout: 30_000 });
		await door.click();
		const drawer = page.getByTestId('register-panel-drawer');
		await expect(drawer, 'the expected cash, which a blind cashier is not shown').toBeVisible({
			timeout: 15_000,
		});
		// The figure reads '—' until the session's figures arrive.
		await expect(drawer).toHaveText(/\d/, { timeout: 30_000 });
		const candidates = cashInputs((await drawer.textContent()) ?? '');
		await page.getByTestId('register-panel-close-register').click();
		const count = page.getByTestId('count-amount');
		await expect(count).toBeVisible({ timeout: 15_000 });
		// A three-digit tail is ambiguous: try each reading. `count-exact` stays the only guard, so
		// nothing is closed until it shows and a wrong candidate cannot record a variance.
		const exact = page.getByTestId('count-exact');
		let expected: string | undefined;
		for (const [index, candidate] of candidates.entries()) {
			await count.fill(candidate);
			if (await becomesVisible(exact, index < candidates.length - 1 ? 5_000 : 10_000)) {
				expected = candidate;
				break;
			}
		}
		if (!expected) {
			throw new Error(`a count of ${candidates.join(' or ')} must match the expected cash`);
		}
		const pushed = page.waitForResponse(
			(response) => {
				const url = new URL(response.url());
				const path = url.searchParams.get('rest_route') ?? url.pathname;
				return response.request().method() === 'POST' && /\/wcpos\/v2\/closures$/.test(path);
			},
			{ timeout: CLOSE_PUSH_TIMEOUT_MS }
		);
		pushed.catch(() => undefined); // a UI step that throws below must not leave it unhandled
		await page.getByTestId('count-close').click();
		await expect(page.getByTestId('closure-title')).toBeVisible({ timeout: 30_000 });
		await page.getByTestId('closure-done').click();
		await expect(page.getByTestId('closure-written')).toHaveCount(0, { timeout: 15_000 });
		const response = await pushed;
		if (!response.ok()) {
			const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
			throw new Error(`POST closures answered ${response.status()} (code ${String(body?.code)})`);
		}
		console.log(`[register] closed, counted ${expected}, server ${response.status()}`);
	});
}
