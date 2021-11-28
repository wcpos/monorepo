import * as React from 'react';
import { View, Text, Button } from 'react-native';
import { action } from '@storybook/addon-actions';
import ErrorBoundary from '.';

export default {
	title: 'Components/Error',
};

const BuggyComponent = () => {
	// const throwError = () => {
	throw new Error('This is a bug');
	// };
	// return <Button onPress={throwError} title="Break it" />;
};

function ErrorFallback({ error, resetErrorBoundary }) {
	return (
		<View>
			<Text>Something went wrong:</Text>
			<Text>{error.message}</Text>
			<Button onPress={resetErrorBoundary} title="Try again" />
		</View>
	);
}

export const BasicUsage = (props) => (
	<ErrorBoundary {...props} onError={action('error handler')}>
		<BuggyComponent />
	</ErrorBoundary>
);

export const WithFallback = (props) => (
	<ErrorBoundary {...props} FallbackComponent={ErrorFallback}>
		<BuggyComponent />
	</ErrorBoundary>
);
