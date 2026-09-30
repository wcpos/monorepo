// sonner's web toaster root. No sonner import here, so an overlay can ask without loading a toast library.
const TOASTER = '[data-sonner-toaster]';

/**
 * Whether an event target sits inside the web toaster. A toast lives outside every overlay, so a
 * modal dialog reads a press on a toast's action (the register panel's Undo) as an outside
 * interaction. Off the web there are no DOM elements and this is always false.
 */
export function isToastTarget(target: EventTarget | null): boolean {
	return (
		typeof Element !== 'undefined' && target instanceof Element && target.closest(TOASTER) !== null
	);
}
