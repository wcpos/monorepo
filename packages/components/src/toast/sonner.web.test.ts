/**
 * Runs against the REAL sonner store, not a mock of it: the regression this
 * guards was sonner changing what its plain `toast()` does with a `type`
 * option (2.0.7 spread it onto the toast; 2.0.8 resets it). A mock of
 * `sonner` would ratify whatever the shim happens to call and miss the next
 * such change.
 */
import { toast as sonnerToast } from 'sonner';

import { toast } from './sonner.web';

import type { ToastT } from 'sonner';

/** `getToasts()` is typed to include dismissals; only real toasts carry a type. */
function liveToast(id: string | number): ToastT | undefined {
	return sonnerToast
		.getToasts()
		.find((entry): entry is ToastT => entry.id === id && 'title' in entry);
}

function typeOf(id: string | number) {
	return liveToast(id)?.type;
}

describe('web toast shim', () => {
	afterEach(() => {
		sonnerToast.dismiss();
	});

	it.each(['success', 'error', 'info', 'warning'] as const)(
		'a `type: %s` option colours the toast',
		(type) => {
			const id = toast('Added to cart', { type });

			expect(typeOf(id)).toBe(type);
		}
	);

	it('leaves an untyped toast untyped', () => {
		const id = toast('Searching online');

		expect(typeOf(id)).toBeUndefined();
	});

	it('leaves unsupported runtime toast types untyped', () => {
		// The logger's deliberately untyped setToast seam can pass its debug level here.
		// @ts-expect-error -- `debug` is a runtime input, not part of the public toast API.
		const id = toast('Debug details', { type: 'debug' });

		expect(typeOf(id)).toBeUndefined();
	});

	it('updates a toast in place when the same id is reused', () => {
		const id = toast('Searching online', { id: 'scan' });
		toast('Added to cart', { id: 'scan', type: 'success' });

		expect(sonnerToast.getToasts().filter((entry) => entry.id === id)).toHaveLength(1);
		expect(typeOf(id)).toBe('success');
	});

	it('passes the remaining options through untouched', () => {
		const id = toast('Host blocked', { type: 'error', testId: 'toast-HOST141', duration: 1234 });

		expect(liveToast(id)).toMatchObject({
			testId: 'toast-HOST141',
			duration: 1234,
		});
	});
});
