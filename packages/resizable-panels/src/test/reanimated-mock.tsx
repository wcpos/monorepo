import React from 'react';
import { View, type ViewProps } from 'react-native';

const listeners = new Set<() => void>();

function AnimatedView(props: ViewProps) {
	return <View {...props} />;
}

export function useSharedValue<T>(initialValue: T) {
	const [sharedValue] = React.useState(() => {
		let value = initialValue;
		return {
			get value() {
				return value;
			},
			set value(nextValue: T) {
				value = nextValue;
				listeners.forEach((listener) => listener());
			},
		};
	});
	return sharedValue;
}

export function useAnimatedStyle<T>(getStyle: () => T): T {
	const [, forceUpdate] = React.useReducer((count) => count + 1, 0);
	React.useLayoutEffect(() => {
		listeners.add(forceUpdate);
		return () => {
			listeners.delete(forceUpdate);
		};
	}, []);
	return getStyle();
}

// eslint-disable-next-line import/no-default-export -- mirrors react-native-reanimated's API
export default { View: AnimatedView };
