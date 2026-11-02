import type { UnsentChanges } from '@wcpos/utils/unsent-changes';

/**
 * Every other string on the root error screen, English for the reason below. The crash title is
 * the route fallback's (`FallbackScreen`), so the two last-resort screens say the same thing.
 */
export const ROOT_ERROR_COPY = {
	crashTitle: 'Something went wrong',
	crashLine: 'Try again keeps everything on this device.',
	tryAgain: 'Try again',
	reset: 'Reset app data and restart',
	resetting: 'Resetting…',
	resetFailed: 'Could not schedule the reset. Close the app completely, open it again, and retry.',
	confirmTitle: 'Reset app data and restart?',
	confirm: 'Reset and restart',
	cancel: 'Cancel',
	restartTitle: 'Restart required',
	restartLine:
		'Local data will be cleared the next time the app starts. Close the app completely and open it again.',
} as const;

/**
 * The root error screen's copy; the reset confirm's body is the branch below (#1098).
 *
 * There is no translation provider above that screen — it renders above every
 * provider, which is the whole reason it can render at all when the app is
 * broken — so it states its copy in English, exactly as the rest of that screen
 * already does. It lives here rather than inline so the branch a cashier
 * actually reads is a unit that can be tested.
 *
 * `unknown` is the fail-soft branch, and it must never read like `none`: when
 * the count cannot be established the confirm says the reset MAY destroy unsent
 * sales. It still offers the reset, because a profile too broken to count is
 * precisely the profile this button exists to recover.
 */
export function resetConfirmBody(unsent: UnsentChanges): string {
	if (unsent.status === 'unknown') {
		return (
			'This deletes everything stored on this device and starts over. ' +
			'The app could not check for changes waiting to be sent, so this may include ' +
			'completed sales that never reached your server. They cannot be recovered.'
		);
	}

	if (unsent.status === 'none') {
		return (
			'This deletes everything stored on this device and starts over. ' +
			'Nothing is waiting to be sent, so your server already has your sales and they download again.'
		);
	}

	const one = unsent.count === 1;
	return (
		`${one ? '1 change' : `${unsent.count} changes`} on this device ` +
		`${one ? 'has' : 'have'} never reached your server and will be permanently lost. ` +
		`${one ? 'It may be a completed sale that exists' : 'They may include completed sales that exist'} ` +
		'only on this device. This deletes everything stored on this device and starts over.'
	);
}
