import { useIsPhone } from '@wcpos/components/lib/device';
import { GUTTER_UNITS } from '@wcpos/components/lib/scale';

/** The ground's gutter as class strings, one per side or use, and in spacing units for px sums. */
export type Ground = {
	readonly p: 'p-gutter' | 'p-4';
	readonly px: 'px-gutter' | 'px-4';
	readonly pt: 'pt-gutter' | 'pt-4';
	readonly pl: 'pl-gutter' | 'pl-4';
	readonly mt: 'mt-gutter' | 'mt-4';
	readonly mx: 'mx-gutter' | 'mx-4';
	readonly gap: 'gap-gutter' | 'gap-4';
	/** Takes back the gutter of the row above (a chip row's bottom padding). */
	readonly negMt: '-mt-gutter' | '-mt-4';
	/** The same gutter in spacing units, for code that needs it in px (`units * unit`). */
	readonly units: number;
};

// Whole literals: the class compiler scans the source for them.
const WINDOW: Ground = Object.freeze({
	p: 'p-gutter',
	px: 'px-gutter',
	pt: 'pt-gutter',
	pl: 'pl-gutter',
	mt: 'mt-gutter',
	mx: 'mx-gutter',
	gap: 'gap-gutter',
	negMt: '-mt-gutter',
	units: GUTTER_UNITS,
});

const PHONE: Ground = Object.freeze({
	p: 'p-4',
	px: 'px-4',
	pt: 'pt-4',
	pl: 'pl-4',
	mt: 'mt-4',
	mx: 'mx-4',
	gap: 'gap-4',
	negMt: '-mt-4',
	units: 4,
});

/**
 * The ground's gutter: the page-gutter token inside a window, 16 at the phone's screen edge
 * (owner, 2026-10-22; CODING_STANDARDS § Gutters). The one place the phone rule is written; a
 * surface reads `useGround().p`, never `phone ? …`.
 */
export function useGround(): Ground {
	return useIsPhone() ? PHONE : WINDOW;
}
