import React from 'react';
import { View, Text } from 'react-native';
import Icon from '../icon';
import Button from '../button';

interface Props {
	componentStack: string;
	error: Error;
	resetErrorBoundary: () => void;
}

/**
 *
 */
const Fallback: React.FC<Props> = ({ componentStack, error, resetErrorBoundary }) => (
	<View>
		<Icon name="error" />
		<Text>Error Boundary Fallback</Text>
		{/* <p>We're sorry — something's gone wrong.</p>
		<p>Our team has been notified, but click here fill out a report.</p> */}
		{/* {error && (
			<pre>
				{error.toString()}
				<br />
				<br />
				This is located at: {componentStack}
			</pre>
		)} */}
		<Text>Something went wrong:</Text>
		<Text>{error.message}</Text>
		<Text>{componentStack}</Text>
		<Button onPress={resetErrorBoundary} title="Try again" />
	</View>
);

export default Fallback;
