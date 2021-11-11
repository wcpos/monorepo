import * as React from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from './components/error-boundary';

const App = () => {
	return (
		<React.Suspense fallback={<Text>loading app...</Text>}>
			<SafeAreaProvider style={{ overflow: 'hidden' }}>
				<Text>Hello, World!</Text>
			</SafeAreaProvider>
		</React.Suspense>
	);
};

export default App;
