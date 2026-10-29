import { cva } from 'class-variance-authority';

/**
 * The type ladder (ruled 2026-10-25, `2026-10-25-heading-label-disclosure-ladder.html`), one rank
 * per line, in the theme's rem steps (`apps/main/global.css`, web base 14). `Text variant=…`
 * reads it; `TABLE_HEAD_TEXT` is the caption rank.
 */
export const TEXT_LADDER = {
	area: 'text-xl font-semibold', // 18 · the area page title
	dialog: 'text-lg font-semibold', // 16 · a dialog or sheet title
	section: 'text-base font-semibold', // 14 · a section heading in a page, dialog or card
	subheading: 'text-base font-medium', // 14 · a group or item name under a section
	body: '', // 14 · running text, the default
	key: 'text-muted-foreground text-sm', // 13 · a property key
	help: 'text-muted-foreground text-xs', // 12 · a help or description line
	// 12 · a column head or list band. Medium, not semibold: decision 9 (2026-10-16) ruled the
	// table head medium and the ladder board kept it.
	caption: 'text-muted-foreground text-xs font-medium tracking-wide uppercase',
} as const;

/** Every `variant` and its classes: the ladder's ranks plus `link`. */
export const TEXT_VARIANTS = {
	...TEXT_LADDER,
	link: 'web:hover:underline web:focus:underline web:hover:cursor-pointer',
} as const;

export const textVariants = cva('text-foreground web:select-text text-base', {
	variants: {
		variant: TEXT_VARIANTS,
		// Tabular numerals, for every amount (CODING_STANDARDS § Design 3).
		tabular: { true: 'tabular-nums', false: '' },
	},
	defaultVariants: { variant: 'body', tabular: false },
});
