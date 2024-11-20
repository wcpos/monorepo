import * as React from 'react';
import { LayoutRectangle, ViewProps } from 'react-native';

type Layout = LayoutRectangle & { measured: boolean };

/**
 * Custom hook to use with `View.onLayout` to get layout of View.
 */
export const useOnLayout = (
	defaultHeight = 0,
	defaultWidth = 0
): [Layout, Required<ViewProps>['onLayout']] => {
	const [layout, setLayout] = React.useState<Layout>({
		height: defaultHeight,
		width: defaultWidth,
		x: 0,
		y: 0,
		measured: false,
	});

	const onLayout = React.useCallback<Required<ViewProps>['onLayout']>(
		({ nativeEvent }) => {
			const { height, width, x, y } = nativeEvent.layout;

			if (height === layout.height && width === layout.width) {
				return;
			}

			setLayout({
				height,
				width,
				x,
				y,
				measured: true,
			});
		},
		[layout.height, layout.width]
	);

	return [layout, onLayout];
};

export default useOnLayout;
