import React from 'react';
import { View, Text, Button } from 'react-native';
import { action } from '@storybook/addon-actions';
import readme from './README.md';

import ErrorBoundary from '.';

export default {
	title: 'Components/Error',
	parameters: {
		notes: { readme },
	},
};

function BuggyComponent() {
	throw new Error('The Error message');
	return <div>Dum Dum</div>;
}

function ErrorFallback({ error, componentStack, resetErrorBoundary }) {
	return (
		<View>
			<Text>Something went wrong:</Text>
			<Text>{error.message}</Text>
			<Text>{componentStack}</Text>
			<Button onPress={resetErrorBoundary} title="Try again" />
		</View>
	);
}

export const basicUsage = () => (
	<ErrorBoundary onError={action('error handler')}>
		<BuggyComponent />
	</ErrorBoundary>
);

export const withFallback = () => (
	<ErrorBoundary FallbackComponent={ErrorFallback}>
		<BuggyComponent />
	</ErrorBoundary>
);

export const withSimpleFallback = () => (
	<ErrorBoundary
		fallback={
			<Text>
				In the spirit of consistency with the React.Suspense component, we also support a simple
				fallback prop which you can use for a generic fallback. This will not be passed any props so
				you can't show the user anything actually useful though, so it's not really recommended.
			</Text>
		}
	>
		<BuggyComponent />
	</ErrorBoundary>
);
