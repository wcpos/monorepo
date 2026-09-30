/**
 * Runs the REAL sonner Toaster: the regression is sonner's toaster inheriting the
 * `pointer-events: none` an open modal dialog puts on the body, which left the register
 * panel's Undo toast visible but unpressable (#2284).
 */
import { act, render, waitFor } from '@testing-library/react';
import { toast as sonnerToast } from 'sonner';

import { Toaster } from './sonner.web';

afterEach(() => {
	act(() => {
		sonnerToast.dismiss();
	});
	document.body.style.pointerEvents = '';
});

/** sonner publishes a toast to the toaster on a timer. */
async function shownToaster() {
	await waitFor(() => expect(document.querySelector('[data-sonner-toaster]')).not.toBeNull());
	return document.querySelector<HTMLElement>('[data-sonner-toaster]')!;
}

it('keeps its toasts pressable under the pointer lock a modal dialog puts on the body', async () => {
	document.body.style.pointerEvents = 'none';
	render(<Toaster />);
	act(() => {
		sonnerToast('Paid out 20.00');
	});

	expect((await shownToaster()).style.pointerEvents).toBe('auto');
});

it('keeps the caller style alongside', async () => {
	render(<Toaster style={{ zIndex: 5 }} />);
	act(() => {
		sonnerToast('Paid out 20.00');
	});

	const toaster = await shownToaster();
	expect(toaster.style.pointerEvents).toBe('auto');
	expect(toaster.style.zIndex).toBe('5');
});
