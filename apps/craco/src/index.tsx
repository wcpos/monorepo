// @ts-nocheck
// import './wdyr'; // Why Did You Render
import { AppRegistry } from 'react-native-web';
import App from '@wcpos/common/src/app';

import './index.css';

// interface WCPOSWindow extends Window {
// 	initialProps: Record<string, unknown>;
// }
// declare let window: WCPOSWindow;

// register the app
AppRegistry.registerComponent('wcpos', () => App);

AppRegistry.runApplication('wcpos', {
	rootTag: document.getElementById('root'),
	initialProps: window.initialProps,
});
