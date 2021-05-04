import * as React from 'react';
import { InlineError, InlineErrorProps } from './inline-error';

export default {
	title: 'Components/InlineError',
	component: InlineError,
};

export const BasicUsage = (props: InlineErrorProps) => {
	return <InlineError {...props} />;
};
BasicUsage.args = {
	message: 'This is a helpful error message',
};
