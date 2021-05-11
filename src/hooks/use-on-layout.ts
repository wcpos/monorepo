import * as React from 'react';
import { LayoutRectangle, ViewProps } from 'react-native';

/**
 * Custom hook to use with `View.onLayout` to get layout of View.
 */
export const useOnLayout = (): [LayoutRectangle | null, Required<ViewProps>['onLayout']] => {
	const [layout, setLayout] = React.useState<LayoutRectangle | null>(null);

	const onLayout = React.useCallback<Required<ViewProps>['onLayout']>(
		({ nativeEvent }) => {
			setLayout(nativeEvent.layout);
		},
		[setLayout]
	);

	return [layout, onLayout];
};

export default useOnLayout;
