import * as React from 'react';
import { Text as RNText } from 'react-native';

import { Slot } from '@rn-primitives/slot';
import { SlottableTextProps } from '@rn-primitives/types';
import { type VariantProps } from 'class-variance-authority';
import { decode } from 'html-entities';

import { cn } from '../lib/utils';
import { MAX_FONT_SCALE } from '../lib/scale';
import { fontFamilyStyle } from '../lib/fonts';
import { useThemeTraits } from '../lib/theme-traits';
import { TextClassContext } from './context';
import { TEXT_VARIANTS, textVariants } from './ladder';

export type TextProps = SlottableTextProps &
	VariantProps<typeof textVariants> & { decodeHtml?: boolean };

function Text({
	className,
	variant,
	tabular,
	asChild = false,
	children,
	decodeHtml,
	// The OS text-size multiplier is capped here rather than at every call site:
	// past 1.3x the keypad and the cart break. A caller's prop still wins.
	maxFontSizeMultiplier = MAX_FONT_SCALE,
	...props
}: TextProps) {
	const textClass = React.useContext(TextClassContext);
	const { type } = useThemeTraits();
	// The numbers face answers the `tabular` prop AND a `tabular-nums` class, from the caller or an
	// inherited context: 93 amounts ask through the class today (Codex, #3138), and a theme whose body
	// face has proportional digits (DM Sans) would otherwise draw them unaligned.
	const numeric = tabular || hasTabularClass(className) || hasTabularClass(textClass);
	// A caller's own family class (`font-mono` on a CodeChip) outranks the theme's face: an inline
	// style would beat the class on web, so the theme steps back when one is present (CodeRabbit, #3138).
	const family =
		hasFamilyClass(className) || hasFamilyClass(textClass)
			? undefined
			: numeric
				? (type.num ?? type.body)
				: type.body;
	const Component = asChild ? Slot : RNText;

	const processedChildren =
		decodeHtml && typeof children === 'string' ? decode(children) : children;

	return (
		<Component
			// An inherited context styles a plain Text; an explicit rank is the caller's word and
			// lands after it (a muted `help` inside an overlay's `text-foreground` stays muted).
			className={cn(
				textVariants({ tabular }),
				textClass,
				variant ? TEXT_VARIANTS[variant] : undefined,
				className
			)}
			maxFontSizeMultiplier={maxFontSizeMultiplier}
			{...props}
			style={family ? [fontFamilyStyle(family), props.style] : props.style}
		>
			{processedChildren}
		</Component>
	);
}

const TABULAR_CLASS = /(^|\s)tabular-nums(\s|$)/;
const FAMILY_CLASS = /(^|\s)font-(mono|sans|serif)(\s|$)/;
function hasFamilyClass(classes: string | undefined) {
	return classes !== undefined && FAMILY_CLASS.test(classes);
}
function hasTabularClass(classes: string | undefined) {
	return classes !== undefined && TABULAR_CLASS.test(classes);
}

export { Text, TextClassContext };
