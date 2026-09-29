import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';
import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { TAKEOVER_DEFER_CEILING_MS } from '../../../packages/database/src/live-tab/live-tab.web';

// Same context is essential: both pages share the origin's OPFS and Web Locks.
test('second tab parks, takes over, and the former holder can take it back', async ({
	page,
	context,
}) => {
	const second = await context.newPage();
	try {
		await second.goto(page.url());
		await expect(second.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'parked:another-tab-live'
		);
		await second.getByTestId('parked-tab-take-over').click();
		await expect(second.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
			timeout: 60_000,
		});
		await expect(page.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'parked:another-tab-live'
		);
		await page.getByTestId('parked-tab-take-over').click();
		await expect(page.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
			timeout: 60_000,
		});
		await expect(second.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'parked:another-tab-live'
		);
	} finally {
		await second.close();
	}
});

test('a write defers takeover, then the ceiling allows it to proceed', async ({
	page,
	context,
}) => {
	const second = await context.newPage();
	try {
		await page.evaluate(() => {
			const runtime = globalThis as typeof globalThis & {
				__wcposLiveTabHold?: (reason: 'write') => () => void;
			};
			if (!runtime.__wcposLiveTabHold)
				throw new Error('This spec requires a dev or E2E-enabled web bundle');
			runtime.__wcposLiveTabHold('write'); // Deliberately unreleased: exercises the ceiling, not a race.
		});
		await second.goto(page.url());
		await second.getByTestId('parked-tab-take-over').click();
		await expect(second.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'taking-over:write'
		);
		await expect(second.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
			timeout: TAKEOVER_DEFER_CEILING_MS + 60_000,
		});
		await expect(page.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'parked:another-tab-live'
		);
	} finally {
		await second.close();
	}
});

test('an unanswered request explains how to continue, but closing the holder still grants ownership', async ({
	page,
	context,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'Freezing the holder uses Chromium CDP');
	const second = await context.newPage();
	const cdp = await context.newCDPSession(page);
	try {
		await second.goto(page.url());
		await expect(second.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'parked:another-tab-live'
		);
		// Preserve its Web Lock while preventing the holder from processing the BroadcastChannel event.
		await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
		await second.getByTestId('parked-tab-take-over').click();
		await expect(second.getByTestId('parked-tab')).toHaveAttribute(
			'data-state',
			'taking-over:no-answer',
			{ timeout: 10_000 }
		);
		await page.close();
		await expect(second.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
			timeout: 60_000,
		});
	} finally {
		if (!page.isClosed()) await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
		await cdp.detach();
		await second.close();
	}
});
