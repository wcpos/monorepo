import { registerRootComponent } from 'expo';
import { connectToDevTools } from 'react-devtools-core';

import App from '@wcpos/core';

if (__DEV__) {
	connectToDevTools({
		host: 'localhost',
		port: 8097,
	});
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in the Expo client or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
