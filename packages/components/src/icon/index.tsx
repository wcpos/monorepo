import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import { useCSSVariable } from 'uniwind';

import { Platform } from '@wcpos/utils/platform';

import { getColorVariableFromClassName } from '../lib/get-color-variable';
import { TONE } from '../lib/tone';
import { cn } from '../lib/utils';
import { Loader, Spin } from '../loader';
import { TextClassContext } from '../text';
import { useIconSet } from './set-context';
import { ICON_SETS } from './sets';

import type { IconName } from './names';

export type { IconName } from './names';
export type { IconSetId } from './sets';
export { ICON_SET_IDS, DEFAULT_ICON_SET } from './sets';
export { IconSetProvider, useIconSet } from './set-context';

/**
 * We need to make the icons bigger for native apps
 */
const iconVariants = cva('inset-0 content-center items-center', {
	variants: {
		variant: {
			default: '',
			primary: 'text-primary',
			secondary: 'text-secondary',
			muted: 'text-muted-foreground',
			ok: TONE.ok.text,
			bad: TONE.bad.text,
			warning: TONE.warning.text,
			info: 'text-info',
			accent: 'text-accent-foreground',
			attention: 'text-attention',
		},
		size: {
			default: 'size-4.5',
			xs: 'size-3.5',
			sm: 'size-4',
			lg: 'size-5',
			xl: 'size-6',
			'2xl': 'size-7',
			'3xl': 'size-8',
			'4xl': 'size-9',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

export type IconProps = VariantProps<typeof iconVariants> & {
	name: IconName;
	/** Swap the glyph for the Loader: a wait in the glyph's place. */
	loading?: boolean;
	/**
	 * Turn the glyph itself while true, and rest it upright when done (`loader/spin.tsx`): for a glyph
	 * that reads as motion (refresh, sync), where swapping it for the Loader jars. `undefined`
	 * mounts no animation at all; a glyph that may spin passes a boolean.
	 */
	spin?: boolean;
	fill?: string;
	className?: string;
	pointerEvents?: ViewProps['pointerEvents'];
};

/**
 *
 */
export function Icon({
	name,
	variant = 'default',
	size,
	loading,
	spin,
	className,
	fill,
	pointerEvents,
	...props
}: IconProps) {
	const set = useIconSet();
	const Svg = ICON_SETS[set][name] ?? ICON_SETS[set].alert;
	const textClass = React.useContext(TextClassContext);

	// Combine all classNames to find the effective text color
	// Order matters: textClass (from context like Button) → iconVariants → className (explicit override)
	const combinedClassName = cn(textClass, iconVariants({ variant, size }), className);

	const cssVariable = getColorVariableFromClassName(combinedClassName) || '--color-foreground';

	// Use Uniwind's useCSSVariable hook to get the actual theme color
	const resolvedColor = useCSSVariable(cssVariable);

	if (loading) {
		return (
			<Loader
				variant={variant as React.ComponentProps<typeof Loader>['variant']}
				size={size as React.ComponentProps<typeof Loader>['size']}
				className={className}
				{...props}
			/>
		);
	}

	/**
	 * Put the iconVariants after the inherited textClass
	 * On web, use currentColor to inherit from CSS (enables hover state changes)
	 * On native, use resolved CSS variable value
	 */
	const svgColor =
		fill || (Platform.isWeb || Platform.isElectron ? 'currentColor' : String(resolvedColor ?? ''));

	const glyph = (
		<Svg
			width="100%"
			height="100%"
			fill={svgColor}
			color={svgColor}
			pointerEvents={pointerEvents}
		/>
	);

	return (
		<View className={combinedClassName} pointerEvents={pointerEvents} {...props}>
			{spin === undefined ? glyph : <Spin active={spin}>{glyph}</Spin>}
		</View>
	);
}
