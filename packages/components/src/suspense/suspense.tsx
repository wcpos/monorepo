import * as React from 'react';
import type { SuspenseProps } from 'react';
import { Text } from 'react-native';

export const DevSuspense = ({ fallback, children }: SuspenseProps) => {
	const renderCount = React.useRef(0);
	const [isFallback, setIsFallback] = React.useState(false);
	const fallbackStartTime = React.useRef<number | null>(null);

	// Extract display names of child components
	const childNames = React.useMemo(() => {
		const names = React.Children.map(children, (child) => {
			if (React.isValidElement(child)) {
				return child.type.displayName || child.type.name || 'Unknown';
			}
			return 'Unknown';
		});
		return names;
	}, [children]);

	React.useEffect(() => {
		renderCount.current += 1;

		if (renderCount.current > 5) {
			// Arbitrary limit, adjust to your needs.
			console.warn(
				'Suspense fallback component has rendered more than 5 times. This might indicate a problem.'
			);
		}
	}, []);

	React.useEffect(() => {
		if (isFallback) {
			fallbackStartTime.current = performance.now();
			console.info('Suspense is in fallback state. Children:', childNames);
			// console.trace('Suspense fallback stack trace:');
		} else {
			if (fallbackStartTime.current) {
				const duration = Math.round(performance.now() - fallbackStartTime.current);
				console.info(`Suspense resolved after ${duration} ms. Children:`, childNames);
			}
			fallbackStartTime.current = null;
		}
	}, [isFallback, childNames]);

	// Wrapper component to detect when fallback is rendered
	const FallbackWrapper = () => {
		React.useEffect(() => {
			setIsFallback(true);
			return () => setIsFallback(false);
		}, []);

		return fallback || <Text>Loading ...</Text>;
	};

	return <React.Suspense fallback={<FallbackWrapper />}>{children}</React.Suspense>;
};
