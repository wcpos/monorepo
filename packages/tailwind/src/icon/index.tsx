import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import get from 'lodash/get';
import { cssInterop } from 'nativewind';

import * as Svgs from './components/fontawesome/solid';
import { cn } from '../lib/utils';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

const iconVariants = cva('fill-foreground', {
	variants: {
		variant: {
			default: '',
			primary: 'fill-primary',
			destructive: 'fill-destructive',
			secondary: 'fill-secondary',
			success: 'fill-success',
		},
		size: {
			default: 'size-3.5',
			xs: 'size-2.5',
			sm: 'size-3',
			lg: 'size-5',
			xl: 'size-6',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

type IconProps = VariantProps<typeof iconVariants> & {
	name: IconName;
	loading?: boolean;
};

/**
 *
 */
export const Icon = ({ name, variant, size, className }: IconProps) => {
	const SvgIcon = React.useMemo(() => {
		const Svg = get(Svgs, name, Svgs.circleExclamation) as React.FC<SvgProps>;

		return cssInterop(Svg, {
			className: {
				target: 'style',
				nativeStyleToProp: { width: true, height: true, fill: true },
			},
		});
	}, [name]);

	return (
		<View className="inset-0 items-center content-center">
			<SvgIcon className={cn(iconVariants({ variant, size }), className)} />
		</View>
	);
};

Icon.displayName = 'Icon';
