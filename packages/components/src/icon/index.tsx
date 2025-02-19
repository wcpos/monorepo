import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import get from 'lodash/get';

import { cn } from '../lib/utils';
import { Loader } from '../loader';
import { TextClassContext } from '../text';
import * as Svgs from './components/fontawesome/solid';

import type { SvgProps } from 'react-native-svg';

export type IconName = Extract<keyof typeof Svgs, string>;

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
			default: 'size-3.5', // 14px
			xs: 'size-3', // 12px
			sm: 'size-[0.8125rem]', // 13px
			lg: 'size-4', // 16px
			xl: 'size-[1.125rem]', // 18px
			'2xl': 'size-5', // 20px
			'3xl': 'size-6', // 24px
			'4xl': 'size-7', // 28px
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
export const Icon = ({ name, variant, size, loading, className, ...props }: IconProps) => {
	const Svg = get(Svgs, name, Svgs.circleExclamation) as React.FC<SvgProps>;
	const textClass = React.useContext(TextClassContext);

	if (loading) {
		return <Loader variant={variant} size={size} className={className} {...props} />;
	}

	/**
	 * Put the iconVariants after the inherited textClass
	 */
	return (
		<View className={cn(textClass, iconVariants({ variant, size }), className)} {...props}>
			<Svg width="100%" height="100%" fill="currentColor" color="currentColor" />
		</View>
	);
};

Icon.displayName = 'Icon';
