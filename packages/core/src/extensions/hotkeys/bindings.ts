import type { CommandId } from '../commands';

/**
 * The default chords (spec §3): Alt on Windows and Linux, Option on a Mac; `react-hotkeys-hook`
 * spells both `alt`. It matches the physical key (`event.code`), so `/` is spelled `slash`.
 */
export const DEFAULT_BINDINGS: readonly { readonly keys: string; readonly command: CommandId }[] =
	Object.freeze([
		{ keys: 'alt+f', command: 'pos.search.focus' },
		{ keys: 'alt+p', command: 'pos.checkout.open' },
		{ keys: 'alt+n', command: 'pos.cart.new' },
		{ keys: 'alt+left', command: 'pos.cart.previous' },
		{ keys: 'alt+right', command: 'pos.cart.next' },
		{ keys: 'alt+d', command: 'pos.cart.discount' },
		{ keys: 'alt+v', command: 'pos.cart.void' },
		{ keys: 'alt+slash', command: 'pos.help.open' },
	]);

export type ChordPlatform = 'mac' | 'other';

/** A Mac labels Alt as Option (`⌥`); so does an iPad's keyboard, which reports itself as a Mac. */
export function chordPlatform(): ChordPlatform {
	if (typeof navigator === 'undefined') return 'other';
	return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other';
}

const KEYCAPS: Record<string, string> = { left: '←', right: '→', slash: '/' };

/** A chord as keycaps: `alt+f` is `['⌥', 'F']` on a Mac and `['Alt', 'F']` elsewhere. */
export function describeChord(keys: string, platform: ChordPlatform = chordPlatform()): string[] {
	return keys
		.split('+')
		.map((key) =>
			key === 'alt' ? (platform === 'mac' ? '⌥' : 'Alt') : (KEYCAPS[key] ?? key.toUpperCase())
		);
}
