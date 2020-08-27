import React from 'react';
import { action } from '@storybook/addon-actions';
import Portal from '../portal';

import Select from '.';

export default {
	title: 'Component/Select',
};

export const basicUsage = (
	<Portal.Host>
		<Select
			placeholder="Select Option"
			options={[
				{ label: 'Option 1' },
				{ label: 'Option 2' },
				{ label: 'Option 3' },
				{ label: 'Option 4' },
				{ label: 'Option 5' },
			]}
		/>
	</Portal.Host>
);
