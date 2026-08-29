/**
 * The suite's `test`, extended with an always-on app-error watcher.
 *
 * WHY THIS EXISTS: on 2026-08-29 three separate native investigations were
 * spent on failures whose reported message named the wrong element — the app
 * was behind an error overlay each time and no failure message said so
 * (monorepo#1665). Web has no overlay to hide behind (LogBox is dev-only and
 * the web E2E runs a production bundle), so the equivalent risk here is the
 * opposite one: an app error that nothing reports at all, on a test that
 * passes anyway.
 *
 * NOTIFIES, DOES NOT FAIL, by default. Failing hard would red every spec
 * where the app legitimately logs an error today, and the first response to
 * that would be to switch the check off — so the signal has to survive
 * contact with the existing suite. Errors are:
 *
 *   - attached to the test (visible in the HTML report and the trace),
 *   - recorded as a test annotation,
 *   - echoed as a GitHub Actions warning so a human or agent reading the run
 *     log sees them WITHOUT opening the report.
 *
 * Set `E2E_FAIL_ON_APP_ERROR=1` to make them throw instead — once the
 * baseline is clean, that is how you keep it clean.
 *
 * Playwright has no built-in switch for this (microsoft/playwright#40880,
 * #27277); a fixture is the documented pattern.
 */
import { test as base, expect } from '@playwright/test';

/** Keeps one noisy error from burying the rest of the report. */
const MAX_REPORTED = 20;

export const test = base.extend<{ appErrorWatcher: void }>({
	appErrorWatcher: [
		async ({ page }, use, testInfo) => {
			const errors: string[] = [];

			// Listeners must be attached BEFORE the test navigates, which is why
			// this is an auto fixture rather than something specs opt into.
			page.on('pageerror', (error) => {
				errors.push(`pageerror: ${error.message}`);
			});
			page.on('console', (message) => {
				if (message.type() === 'error') {
					errors.push(`console.error: ${message.text()}`);
				}
			});

			await use();

			if (errors.length === 0) return;

			// Dedupe: a render loop can emit the same error hundreds of times.
			const unique = [...new Set(errors)];
			const reported = unique.slice(0, MAX_REPORTED);
			const body =
				reported.join('\n') +
				(unique.length > reported.length
					? `\n… and ${unique.length - reported.length} more distinct error(s)`
					: '');

			await testInfo.attach('app-console-errors', { body, contentType: 'text/plain' });
			testInfo.annotations.push({
				type: 'app-error',
				description: `${unique.length} distinct app error(s) — see the app-console-errors attachment`,
			});

			if (process.env.CI) {
				for (const line of reported) {
					// One line, escaped: a literal newline would end the workflow command.
					const escaped = line.replace(/\r?\n/g, ' ').slice(0, 400);
					console.log(`::warning title=app error in ${testInfo.title}::${escaped}`);
				}
			}

			if (process.env.E2E_FAIL_ON_APP_ERROR === '1') {
				throw new Error(`${unique.length} app error(s) during "${testInfo.title}":\n${body}`);
			}
		},
		{ auto: true },
	],
});

export { expect };
