import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import * as Sentry from 'sentry-expo';
// import * as React from 'react';

import App from '@wcpos/core';

// const StrictApp = () => {
// 	return (
// 		<React.StrictMode>
// 			<App />
// 		</React.StrictMode>
// 	);
// };

Sentry.init({
	dsn: 'https://39233e9d1e5046cbb67dae52f807de5f@o159038.ingest.sentry.io/1220733',
	enableInExpoDevelopment: false,
	debug: false, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in the Expo client or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
