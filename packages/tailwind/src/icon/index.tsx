import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { cssInterop } from 'nativewind';

import * as Svgs from './components/fontawesome/solid';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

/**
 *
 */
const textSizeToPixel = {
	'text-xs': 12,
	'text-sm': 14,
	'text-base': 16,
	'text-lg': 18,
	'text-xl': 20,
	'text-2xl': 24,
	'text-3xl': 30,
	'text-4xl': 36,
	'text-5xl': 48,
	'text-6xl': 60,
	'text-7xl': 72,
	'text-8xl': 96,
	'text-9xl': 128,
	'native:text-xs': 12,
	'native:text-sm': 14,
	'native:text-base': 16,
	'native:text-lg': 18,
	'native:text-xl': 20,
	'native:text-2xl': 24,
	'native:text-3xl': 30,
	'native:text-4xl': 36,
	'native:text-5xl': 48,
	'native:text-6xl': 60,
	'native:text-7xl': 72,
	'native:text-8xl': 96,
	'native:text-9xl': 128,
};

/**
 *
 */
const getTextSizeAndColor = (className: string): { size: number; color: string } => {
	const classes = className.split(' ');

	// Define regex patterns for text size and color classes
	const textSizePattern =
		/^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)|native:text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl))$/;
	const textColorPattern = /^(text-(\w+)|group-active:text-(\w+))$/;

	let textSize: number = 14; // Default size
	let textColor: string = 'currentColor'; // Default color

	classes.forEach((cls) => {
		if (textSizePattern.test(cls)) {
			textSize = textSizeToPixel[cls] || 14;
		}
		const colorMatch = cls.match(textColorPattern);
		if (colorMatch) {
			textColor = `hsl(var(--${colorMatch[2] || colorMatch[3]}))`;
		}
	});

	return {
		size: textSize,
		color: textColor,
	};
};

/**
 *
 */
export interface IconProps {
	/** Icon key. */
	name: IconName;
}

/**
 *
 */
export const Icon = ({ name, className }: IconProps) => {
	// const textClass = React.useContext(TextClassContext);
	// const { size, color } = getTextSizeAndColor(textClass || '');
	// console.log('Icon', { size, color });

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
			<SvgIcon className={cn('h-3.5 w-3.5 fill-current', className)} />
			{/* <SvgIcon width={size} height={size} color={color} /> */}
		</View>
	);
};
