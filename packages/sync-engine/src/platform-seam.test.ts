/**
 * PLATFORM SEAM — what the runtime under our feet actually does.
 *
 * Every native-only red box in the #1662..#1677 series was a *platform fact*
 * that differs between web/Electron and React Native, and every one of them was
 * found by an hour-long Maestro run on a simulator when a millisecond of vitest
 * would have done it:
 *
 *   #1674  expo's winter fetch rejects an abort with a PLAIN Error wrapping
 *          FetchRequestCanceledException, not a WHATWG AbortError.
 *   #1677  React Native's AbortController is the `abort-controller` polyfill,
 *          whose abort() takes NO arguments — an abort reason is silently
 *          discarded, so signal.reason is undefined on native and only there.
 *
 * These tests do two different jobs, and the distinction matters:
 *
 *   1. They pin the behaviour of the runtime this suite runs in (Node), so a
 *      claim like "AbortController preserves the reason" is checked rather than
 *      assumed.
 *
 *   2. They read the shipped React Native / expo sources directly to pin what
 *      the NATIVE runtime does. Those files are what the device executes, and
 *      an upgrade that changes them should break a test here rather than a
 *      nightly on a simulator.
 *
 * When you find a new native/web divergence, ADD IT HERE.
 * See .claude/rules/native-e2e-diagnosis.mdc §6.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
// packages/sync-engine/src -> repo root
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readDependencySource(specifier: string): string {
	return readFileSync(require_.resolve(specifier), 'utf8');
}

describe('platform seam: AbortController abort reasons', () => {
	it('preserves the reason on this runtime (Node/web/Electron)', () => {
		const controller = new AbortController();
		const reason = new DOMException('Requirement released during drain', 'AbortError');
		controller.abort(reason);

		expect(controller.signal.reason).toBe(reason);
		expect((controller.signal.reason as Error).name).toBe('AbortError');
	});

	it('DROPS the reason on React Native — its polyfill takes no argument', () => {
		// react-native/Libraries/Core/setUpXHR.js polyfills the global
		// AbortController from this package. Its abort() is declared with no
		// parameters and the source contains no notion of a reason at all, so
		// `abort(new DOMException(...))` throws the argument away and
		// `signal.reason` is undefined on device.
		//
		// This is the whole of #1677: require-plane's abandon() passes a
		// correctly-named AbortError that never arrives, the scheduler runner's
		// `signal.reason instanceof Error` guard misses, and its plain-Error
		// fallback is classified as a genuine coverage failure — drawn by the
		// dev client as a red box over a working POS.
		const source = readDependencySource('abort-controller/dist/abort-controller.js');

		expect(source).toMatch(/abort\(\)\s*\{/);
		expect(source).not.toMatch(/\breason\b/);
	});

	it('expo patches the reason back on, which is why it can be trusted through expo APIs', () => {
		// expo/src/winter/AbortSignal.ts carries abortWithReason(), which calls
		// abort(reason) and then re-defines signal.reason when the platform
		// dropped it. Corroborating evidence for the test above: the workaround
		// only makes sense against a polyfill that loses the argument.
		//
		// It is applied to expo's OWN signals. A bare `new AbortController()` in
		// our code — which is what require-plane uses — does not get it.
		const source = readFileSync(require_.resolve('expo/src/winter/AbortSignal.ts'), 'utf8');

		expect(source).toMatch(/function abortWithReason/);
		expect(source).toMatch(/controller\.signal\.reason !== reason/);
	});
});

describe('platform seam: how an aborted request rejects', () => {
	it('names a cancellation AbortError on this runtime', async () => {
		const controller = new AbortController();
		controller.abort();

		const error = await Promise.reject(controller.signal.reason).catch((caught: unknown) => caught);

		expect((error as Error).name).toBe('AbortError');
	});

	it('expo raises its cancellation in NATIVE code, so it crosses as a plain Error', () => {
		// The #1674 fact, pinned against expo's shipped source rather than a
		// remembered device observation.
		//
		// The decisive detail is WHERE this lives: it is a Swift/Kotlin
		// Exception, not a JS DOMException. It reaches JS across the bridge as
		// an ordinary Error carrying the reason string below, so `name` is
		// "Error" and the WHATWG `name === 'AbortError'` contract simply does
		// not hold on native. The message is the only evidence it carries,
		// which is why require-plane matches on it.
		//
		// If an expo upgrade renames the exception or its reason, this breaks
		// HERE — in milliseconds — instead of as a red box on a nightly.
		const ios = readFileSync(
			path.join(ROOT, 'node_modules/expo/ios/Fetch/FetchExceptions.swift'),
			'utf8'
		);
		const android = readFileSync(
			path.join(
				ROOT,
				'node_modules/expo/android/src/main/java/expo/modules/fetch/FetchExceptions.kt'
			),
			'utf8'
		);

		for (const source of [ios, android]) {
			expect(source).toMatch(/FetchRequestCanceledException/);
			expect(source).toMatch(/Fetch request has been canceled/);
		}
	});
});
