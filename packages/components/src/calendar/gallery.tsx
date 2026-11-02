import type * as React from 'react';

import { Calendar } from './index';

const examples: ({ id: string } & React.ComponentProps<typeof Calendar>)[] = [
	// A month that never holds today: the calendar marks today in the primary colour, and a
	// story on the current month rewrote its twelve baselines at every UTC midnight.
	{
		id: 'month',
		dateRange: { from: new Date(2026, 5, 8), to: new Date(2026, 5, 13) },
		maxDate: '2026-06-24',
	},
];
export const stories = examples.map(({ id, ...props }) => ({
	id,
	render: () => <Calendar {...props} />,
}));
