import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import get from 'lodash/get';
import { useCSSVariable } from 'uniwind';

import { Platform } from '@wcpos/utils/platform';

import { getColorVariableFromClassName } from '../lib/get-color-variable';
import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { TextClassContext } from '../text';
import * as Svgs from './components/fontawesome/solid';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

/**
 * Map variant to CSS variable name for SVG fill colors
 */
const variantToCSSVariable: Record<string, string> = {
	default: '--color-foreground',
	primary: '--color-primary',
	destructive: '--color-destructive',
	secondary: '--color-secondary',
	muted: '--color-muted-foreground',
	success: '--color-success',
	error: '--color-error',
	warning: '--color-warning',
	info: '--color-info',
	accent: '--color-accent-foreground',
	attention: '--color-attention',
};

/**
 * We need to make the icons bigger for native apps
 */
const iconVariants = cva('inset-0 content-center items-center', {
	variants: {
		variant: {
			default: '',
			primary: 'text-primary',
			destructive: 'text-destructive',
			secondary: 'text-secondary',
			muted: 'text-muted-foreground',
			success: 'text-success',
			error: 'text-error',
			warning: 'text-warning',
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
	loading?: boolean;
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
	className,
	fill,
	pointerEvents,
	...props
}: IconProps) {
	const Svg = get(Svgs, name, Svgs.circleExclamation) as React.FC<SvgProps>;
	const textClass = React.useContext(TextClassContext);

	// Combine all classNames to find the effective text color
	// Order matters: textClass (from context like Button) → iconVariants → className (explicit override)
	const combinedClassName = cn(textClass, iconVariants({ variant, size }), className);

	// Extract CSS variable from className, falling back to variant's default
	const cssVariable =
		getColorVariableFromClassName(combinedClassName) ||
		variantToCSSVariable[variant ?? 'default'] ||
		'--color-foreground';

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

	return (
		<View className={combinedClassName} pointerEvents={pointerEvents} {...props}>
			<Svg
				width="100%"
				height="100%"
				fill={svgColor}
				color={svgColor}
				pointerEvents={pointerEvents}
			/>
		</View>
	);
}
