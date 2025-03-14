import * as React from 'react';
import { View, Platform } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import get from 'lodash/get';

import { getResolvedColor } from '../lib/icon-colors';
import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { TextClassContext } from '../text';
import * as Svgs from './components/fontawesome/solid';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

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
			default: Platform.OS === 'web' ? 'size-4' : 'size-5',
			xs: Platform.OS === 'web' ? 'size-3' : 'size-4',
			sm: Platform.OS === 'web' ? 'size-[0.8125rem]' : 'size-[1.125rem]',
			lg: Platform.OS === 'web' ? 'size-4' : 'size-5',
			xl: Platform.OS === 'web' ? 'size-[1.125rem]' : 'size-6',
			'2xl': Platform.OS === 'web' ? 'size-5' : 'size-7',
			'3xl': Platform.OS === 'web' ? 'size-6' : 'size-8',
			'4xl': Platform.OS === 'web' ? 'size-7' : 'size-9',
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
};

/**
 *
 */
export const Icon = ({ name, variant, size, loading, className, fill, ...props }: IconProps) => {
	const Svg = get(Svgs, name, Svgs.circleExclamation) as React.FC<SvgProps>;
	const textClass = React.useContext(TextClassContext);
	const resolvedColor = getResolvedColor(variant, cn(textClass, className));

	if (loading) {
		return <Loader variant={variant} size={size} className={className} {...props} />;
	}

	/**
	 * Put the iconVariants after the inherited textClass
	 * NOTE: fill="currentColor" or color="currentColor" is not inheriting the CSS variables on iOS/Android
	 * So, we need to manually tranform the className to the correct color
	 */
	return (
		<View className={cn(textClass, iconVariants({ variant, size }), className)} {...props}>
			<Svg width="100%" height="100%" fill={fill || resolvedColor} color={fill || resolvedColor} />
		</View>
	);
};

Icon.displayName = 'Icon';
