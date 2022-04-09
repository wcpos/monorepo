import * as React from 'react';

import { FormatNumber, FormatNumberProps } from './format-number';

export default {
	title: 'Components/FormatNumber',
	component: FormatNumber,
};

/**
 *
 */
export const BasicUsage = (props) => {
	return <FormatNumber {...props} />;
};
BasicUsage.args = {
	value: 3.99,
};
