/**
 * J1 "Open the register and run the session": a cashier's whole register session, written once
 * as nine steps, from a closed register through float, pay in, pay out, no sale, count and close.
 *
 * - Start state: register sessions on, this till's register closed, the open-register card in
 *   the cart.
 * - Edition: Free.
 * - Docs: `pos/register/index.mdx` (wcpos/docs, `versioned_docs/version-2.x`).
 * - Soak-loopable: yes, the reset is step 9, which leaves the start state holding again.
 * - Source ruling: wcpos/roadmap#539.
 *
 * Sessions, movements and closures are written locally first and reach the server on the
 * register's push tick. Two steps hold the page until their write lands: step 2 (the session)
 * and step 8 (the closure). Movements are not held; a spec asserts them after the walk.
 */
import { expect, type Page, test, type TestInfo } from '@playwright/test';

import { decimalPlaces, digitsOf } from '../checkout-shared';
import {
	cashInput,
	CLOSE_PUSH_TIMEOUT_MS,
	openCashierSheet,
	posLayout,
	showPhoneTab,
} from './open-register';
import { wirePath } from './register-wire-stub';

export const OPEN_THE_REGISTER = {
	key: 'J1',
	title: 'Open the register and run the session',
	edition: 'free',
	docsPage: 'pos/register/index.mdx',
	soakLoopable: true,
	resetStep: 9,
} as const;

export const STEPS = [
	{ number: 1, slug: 'see-closed', title: 'See the register closed' },
	{ number: 2, slug: 'open-with-float', title: 'Open it with a float' },
	{ number: 3, slug: 'see-cashier-sheet', title: 'See the cashier sheet' },
	{ number: 4, slug: 'pay-in', title: 'Pay cash in' },
	{ number: 5, slug: 'pay-out', title: 'Pay cash out' },
	{ number: 6, slug: 'no-sale', title: 'Open the drawer with no sale' },
	{ number: 7, slug: 'count-the-drawer', title: 'Count the drawer' },
	{ number: 8, slug: 'see-closure', title: 'See the closure' },
	{ number: 9, slug: 'closed-again', title: 'See the register closed again' },
] as const;
export type JourneyStep = (typeof STEPS)[number];

/** `'done'`: a step's own assertions passed. */
export type CheckpointId = 'done';

export interface OpenTheRegisterContext {
	page: Page;
	testInfo: TestInfo;
	/** The opening float keyed in step 2. Default `'100'`. */
	float?: string;
	/** Step 4's pay in. Default `'20'`. */
	payIn?: string;
	/** Step 5's pay out. Default `'5'`. */
	payOut?: string;
	/**
	 * Observe-only: a checkpoint reads, waits or shoots; it never presses, types or navigates.
	 * The walk owns every action.
	 */
	onCheckpoint?: (step: JourneyStep, id: CheckpointId) => Promise<void>;
}

/** What step 1 leaves: the layout, detected once. */
export interface RegisterWalk {
	layout: 'phone' | 'columns';
}

/** What step 6 leaves: the drawer figure the panel shows, as text. */
export interface CountedWalk extends RegisterWalk {
	drawer: string;
}

/**
 * The register pushes on a 60 s tick, and only while the page lives: a write made just after a
 * tick waits up to a minute, plus the request itself. 90 s covers one tick with room to answer.
 */
export const REGISTER_PUSH_TIMEOUT_MS = 90_000;

const DEFAULT_FLOAT = '100';
const DEFAULT_PAY_IN = '20';
const DEFAULT_PAY_OUT = '5';

async function journeyStep<T>(
	ctx: OpenTheRegisterContext,
	number: JourneyStep['number'],
	body: () => Promise<T>
): Promise<T> {
	const step = STEPS[number - 1];
	return test.step(`${step.number}. ${step.title}`, async () => {
		const result = await body();
		await ctx.onCheckpoint?.(step, 'done');
		return result;
	});
}

/**
 * Start waiting for the app's push of a register write BEFORE the action that causes it, then
 * await the result after: it throws on a non-2xx, naming the status and the error `code` only.
 */
export function holdForPush(
	page: Page,
	pathPattern: RegExp,
	timeout = REGISTER_PUSH_TIMEOUT_MS
): () => Promise<void> {
	const response = page.waitForResponse(
		(candidate) =>
			candidate.request().method() === 'POST' &&
			pathPattern.test(wirePath(new URL(candidate.url()))),
		{ timeout }
	);
	// Settled here so a walk that throws before awaiting leaves no unhandled rejection.
	const settled = response.then(
		(value) => ({ value }),
		(error: unknown) => ({ error })
	);
	return async () => {
		const result = await settled;
		if ('error' in result) throw result.error;
		const { value } = result;
		if (value.ok()) return;
		const code = await value.json().then(
			(body: { code?: unknown }) => body?.code,
			() => undefined
		);
		throw new Error(`POST ${pathPattern} answered ${value.status()} (code ${String(code)})`);
	};
}

const SESSIONS = /\/wcpos\/v2\/sessions$/;
const CLOSURES = /\/wcpos\/v2\/closures$/;

/** The cart's card and pill; a phone shows the cart on its Cart tab. */
async function showCart(page: Page, layout: RegisterWalk['layout']): Promise<void> {
	if (layout === 'phone') await showPhoneTab(page, 'cart');
}

/**
 * A movement from the register panel: its tile, the amount, a reason chip, confirm. Not held for
 * its push: once step 2's session is acknowledged the drawer figure has its server baseline, and
 * movements after it are local deltas on that baseline (`deriveExpected`), so step 6 reads them
 * unpushed. The spec asserts the pushed rows after the walk.
 */
async function recordMovement(
	page: Page,
	tile: string,
	amount: string | null,
	reason: string
): Promise<void> {
	await page.getByTestId(tile).click();
	if (amount !== null) await page.getByTestId('movement-amount').fill(amount);
	await page.getByTestId(reason).click();
	await page.getByTestId('movement-confirm').click();
	await expect(page.getByTestId('movement-confirm'), 'confirm closes the sheet').toBeHidden({
		timeout: 15_000,
	});
}

/** 1. See the register closed: the card first, never the cart. */
export async function seeClosed(ctx: OpenTheRegisterContext): Promise<RegisterWalk> {
	return journeyStep(ctx, 1, async () => {
		const { page } = ctx;
		const layout = await posLayout(page);
		await showCart(page, layout);
		// A store row flips to sessions on a moment after boot, so the cart can show before the
		// card does: wait for the card itself.
		await expect(page.getByTestId('open-register-card')).toBeVisible({ timeout: 60_000 });
		await expect(page.getByTestId('register-bar-pill').first()).toBeVisible({ timeout: 15_000 });
		return { layout };
	});
}

/**
 * 2. Open it with a float, held until the session reaches the server: the acknowledged row then
 * holds the server's `opened_at_gmt` form (monorepo#3251's path), and the drawer its baseline.
 */
export async function openWithFloat(
	ctx: OpenTheRegisterContext,
	walk: RegisterWalk
): Promise<void> {
	await journeyStep(ctx, 2, async () => {
		const { page } = ctx;
		await showCart(page, walk.layout);
		await page.getByTestId('open-register-amount').fill(ctx.float ?? DEFAULT_FLOAT);
		const pushed = holdForPush(page, SESSIONS);
		await page.getByTestId('open-register-button').click();
		await expect(page.getByTestId('open-register-card')).toHaveCount(0, { timeout: 15_000 });
		await expect(page.getByTestId('add-cart-item-menu').first()).toBeVisible({ timeout: 15_000 });
		// An open session on time with nothing awaiting the store reads no pill at all.
		await expect(page.getByTestId('register-bar-pill')).toHaveCount(0, { timeout: 15_000 });
		await pushed();
	});
}

/** 3. See the cashier sheet: the avatar's sheet, the one door to the register. */
export async function seeCashierSheet(
	ctx: OpenTheRegisterContext,
	walk: RegisterWalk
): Promise<void> {
	await journeyStep(ctx, 3, async () => {
		const { page } = ctx;
		await showCart(page, walk.layout);
		await openCashierSheet(page);
		await expect(page.getByTestId('user-sheet-switch-user')).toBeVisible({ timeout: 15_000 });
	});
}

/** 4. Pay cash in, from the register panel the sheet's drawer door opens. */
export async function payIn(ctx: OpenTheRegisterContext): Promise<void> {
	await journeyStep(ctx, 4, async () => {
		const { page } = ctx;
		await page.getByTestId('user-sheet-drawer').click();
		await expect(page.getByTestId('register-panel')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('register-panel-drawer')).toHaveText(/\d/, { timeout: 30_000 });
		await recordMovement(
			page,
			'register-panel-paid-in',
			ctx.payIn ?? DEFAULT_PAY_IN,
			'movement-reason-float'
		);
	});
}

/** 5. Pay cash out. */
export async function payOut(ctx: OpenTheRegisterContext): Promise<void> {
	await journeyStep(ctx, 5, async () => {
		await recordMovement(
			ctx.page,
			'register-panel-paid-out',
			ctx.payOut ?? DEFAULT_PAY_OUT,
			'movement-reason-petty-cash'
		);
	});
}

/** 6. Open the drawer with no sale; the drawer then holds float + pay in − pay out. */
export async function noSale(
	ctx: OpenTheRegisterContext,
	walk: RegisterWalk
): Promise<CountedWalk> {
	return journeyStep(ctx, 6, async () => {
		const { page } = ctx;
		await recordMovement(page, 'register-panel-no-sale', null, 'movement-reason-drawer-check');
		await expect(page.getByTestId('register-panel-movements')).toBeVisible({ timeout: 15_000 });
		const drawer = page.getByTestId('register-panel-drawer');
		await expect(drawer).toHaveText(/\d/, { timeout: 30_000 });
		// Minor units at the shown precision, never a formatted string.
		const expectedMinor = (text: string) =>
			Math.round(
				(Number(ctx.float ?? DEFAULT_FLOAT) +
					Number(ctx.payIn ?? DEFAULT_PAY_IN) -
					Number(ctx.payOut ?? DEFAULT_PAY_OUT)) *
					10 ** decimalPlaces(text)
			);
		await expect
			.poll(
				async () => {
					const text = (await drawer.textContent()) ?? '';
					return Number(digitsOf(text)) - expectedMinor(text);
				},
				{ message: 'the drawer holds float + pay in − pay out', timeout: 15_000 }
			)
			.toBe(0);
		return { ...walk, drawer: (await drawer.textContent()) ?? '' };
	});
}

/** 7. Count the drawer: exactly what it holds, or the run stops before anything is closed. */
export async function countTheDrawer(
	ctx: OpenTheRegisterContext,
	walk: CountedWalk
): Promise<void> {
	await journeyStep(ctx, 7, async () => {
		const { page } = ctx;
		const counted = cashInput(walk.drawer);
		await page.getByTestId('register-panel-close-register').click();
		const count = page.getByTestId('count-amount');
		await expect(count).toBeVisible({ timeout: 15_000 });
		await count.fill(counted);
		await expect(
			page.getByTestId('count-exact'),
			`a count of ${counted} must match the expected cash`
		).toBeVisible({ timeout: 10_000 });
	});
}

/** 8. See the closure, held until it reaches the server. */
export async function seeClosure(ctx: OpenTheRegisterContext): Promise<void> {
	await journeyStep(ctx, 8, async () => {
		const { page } = ctx;
		const pushed = holdForPush(page, CLOSURES, CLOSE_PUSH_TIMEOUT_MS);
		await page.getByTestId('count-close').click();
		await expect(page.getByTestId('closure-title')).toBeVisible({ timeout: 30_000 });
		await pushed();
	});
}

/** 9. See the register closed again: step 1's start state, so a soak can loop. */
export async function closedAgain(ctx: OpenTheRegisterContext, walk: RegisterWalk): Promise<void> {
	await journeyStep(ctx, 9, async () => {
		const { page } = ctx;
		await page.getByTestId('closure-done').click();
		await expect(page.getByTestId('closure-written')).toHaveCount(0, { timeout: 15_000 });
		await showCart(page, walk.layout);
		await expect(page.getByTestId('open-register-card')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('open-register-last-closure')).toBeVisible({ timeout: 15_000 });
	});
}

/** The whole walk, steps 1 to 9, ending in the state it started in. */
export async function openTheRegister(ctx: OpenTheRegisterContext): Promise<CountedWalk> {
	const walk = await seeClosed(ctx);
	await openWithFloat(ctx, walk);
	await seeCashierSheet(ctx, walk);
	await payIn(ctx);
	await payOut(ctx);
	const counted = await noSale(ctx, walk);
	await countTheDrawer(ctx, counted);
	await seeClosure(ctx);
	await closedAgain(ctx, walk);
	return counted;
}
