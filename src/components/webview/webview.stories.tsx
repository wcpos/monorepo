import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import WebView from './webview.web';

storiesOf('WebView', module)
	/**
	 *
	 */
	.add('basic usage', () => <WebView src="https://wcpos.com" onLoad={action('onLoad')} />);
