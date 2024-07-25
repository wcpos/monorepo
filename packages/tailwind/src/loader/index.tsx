import * as React from 'react';
import { ActivityIndicator, ActivityIndicatorProps } from 'react-native';

export type LoaderProps = {
	/** */
	type?: import('@wcpos/themes').ColorTypes;

	/** Make ActivityIndicator size compatible with Icon component */
	size?: import('@wcpos/themes').IconSizesTypes;
} & Omit<ActivityIndicatorProps, 'size'>;

/**
 *
 */
export const Loader = ({ type, size = 'normal', ...props }: LoaderProps) => {
	// const theme = useTheme();
	// const color = theme.colors[type || 'primary'];

	return (
		<ActivityIndicator
			size="small"
			// color={color}
			// // FIXME: I don't know if this will work in native, I think I need a better spinner
			// size={parseFloat(theme.iconSizes[size])}
			{...props}
		/>
	);
};
