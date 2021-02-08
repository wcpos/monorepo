import * as React from 'react';
import { action } from '@storybook/addon-actions';
import WebView from './webview';

export default {
	title: 'Components/WebView',
};

export const basicUsage = () => <WebView src="https://wcpos.com" onLoad={action('onLoad')} />;
