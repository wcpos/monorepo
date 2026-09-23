import type * as React from 'react';

import { Calendar } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Calendar>)[] = [
	{
		id: 'month',
		dateRange: { from: new Date(2026, 8, 7), to: new Date(2026, 8, 12) },
		maxDate: '2026-09-23',
	},
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Calendar {...props} />,
}));
