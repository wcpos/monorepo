import * as React from 'react';
import { ActivityIndicator, ActivityIndicatorProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';
import { cssInterop } from 'nativewind';

const loaderVariants = cva('', {
	variants: {
		variant: {
			default: 'foreground',
			primary: 'primary',
			destructive: 'destructive',
			secondary: 'secondary',
			success: 'success',
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

type LoaderProps = VariantProps<typeof loaderVariants>;

/**
 *
 */
export const Loader = ({ variant, size }: LoaderProps) => {
	const LoaderIcon = React.useMemo(() => {
		return cssInterop(ActivityIndicator, {
			className: {
				target: 'style',
				nativeStyleToProp: { width: true, height: true, color: true },
			},
		});
	}, []);

	return <LoaderIcon className={loaderVariants({ variant, size })} />;
};
