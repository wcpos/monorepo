import * as React from 'react';
import type { SuspenseProps } from 'react';
import { Text } from 'react-native';

interface FallbackWrapperProps {
	fallback: React.ReactNode;
	onMount: () => void;
	onUnmount: () => void;
}

const FallbackWrapper = ({ fallback, onMount, onUnmount }: FallbackWrapperProps) => {
	React.useEffect(() => {
		onMount();
		return onUnmount;
	}, [onMount, onUnmount]);

	return fallback || <Text>Loading ...</Text>;
};

export const DevSuspense = ({ fallback, children }: SuspenseProps) => {
	const renderCount = React.useRef(0);
	const fallbackStartTime = React.useRef<number | null>(null);

	// Extract display names of child components
	const childNames = React.useMemo(() => {
		const names = React.Children.map(children, (child) => {
			if (React.isValidElement(child)) {
				const type = child.type;
				if (typeof type === 'string') return type;
				return (
					(type as { displayName?: string; name?: string }).displayName ||
					(type as { name?: string }).name ||
					'Unknown'
				);
			}
			return 'Unknown';
		});
		return names;
	}, [children]);

	React.useEffect(() => {
		renderCount.current += 1;

		if (renderCount.current > 5) {
			console.warn(
				'Suspense fallback component has rendered more than 5 times. This might indicate a problem.'
			);
		}
	}, []);

	// Timing logic lives directly in the callbacks — no state-as-trigger needed
	const handleMount = React.useCallback(() => {
		fallbackStartTime.current = performance.now();
		console.info('Suspense is in fallback state. Children:', childNames);
	}, [childNames]);

	const handleUnmount = React.useCallback(() => {
		if (fallbackStartTime.current) {
			const duration = Math.round(performance.now() - fallbackStartTime.current);
			console.info(`Suspense resolved after ${duration} ms. Children:`, childNames);
		}
		fallbackStartTime.current = null;
	}, [childNames]);

	return (
		<React.Suspense
			fallback={
				<FallbackWrapper fallback={fallback} onMount={handleMount} onUnmount={handleUnmount} />
			}
		>
			{children}
		</React.Suspense>
	);
};
