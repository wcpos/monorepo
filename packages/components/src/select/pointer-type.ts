/**
 * Decide whether the web Select trigger's own press handler should toggle the
 * select open/closed, given the pointer type of the gesture that produced it.
 *
 * The three activation paths on web are handled by three different owners:
 *
 * - **mouse** — Radix opens on `pointerdown` (`pointerType === 'mouse'`), so the
 *   press handler must stay out of the way or the select would open and close
 *   again in the same click.
 * - **keyboard** — Radix opens on `keydown`. Enter/Space still reach
 *   react-native-web's press handler, but with no pointer gesture in flight
 *   (`null`), so the press handler stays out of the way here too.
 * - **touch / pen** — Radix's own handler for this path is `onClick`, which
 *   react-native-web's `Pressable` overwrites, so it never runs. This is the
 *   one path the trigger has to drive itself.
 *
 * @param pointerType the `pointerType` of the `pointerdown` that started the
 *   gesture, or `null`/`undefined` when there was none (keyboard activation).
 *   It must not be read off the `click`/press event: WebKit reports
 *   `pointerType: 'mouse'` on the compatibility `click` it synthesises after a
 *   touch, which is what broke every select on iPadOS (#863).
 */
export function shouldToggleFromPress(pointerType: string | null | undefined): boolean {
	if (!pointerType) return false;
	return pointerType !== 'mouse';
}
