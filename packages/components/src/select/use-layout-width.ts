import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Measures a component's width via onLayout.
 * Useful for matching popover/dropdown width to a trigger element.
 */
export function useLayoutWidth() {
	const [width, setWidth] = useState<number | undefined>();

	const onLayout = useCallback((e: LayoutChangeEvent) => {
		setWidth(e.nativeEvent.layout.width);
	}, []);

	return { width, onLayout };
}
