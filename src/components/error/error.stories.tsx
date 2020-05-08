import React from 'react';
import markdown from './README.md';
import { action } from '@storybook/addon-actions';

import ErrorBoundary from '.';

export default {
	title: 'Components/Error',
	parameters: {
		notes: { markdown },
	},
};

function BuggyComponent() {
	throw new Error('The Error message');
	return <div>Dum Dum</div>;
}

export const basicUsage = () => (
	<ErrorBoundary onError={action('error handler')}>
		<BuggyComponent />
	</ErrorBoundary>
);
