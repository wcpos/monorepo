import * as React from 'react';
export type { DateRange } from './calendar-impl';
const CalendarImpl = React.lazy(() =>
	import('./calendar-impl').then((m) => ({ default: m.Calendar }))
);
export function Calendar(props: React.ComponentProps<typeof CalendarImpl>) {
	return (
		<React.Suspense fallback={null}>
			<CalendarImpl {...props} />
		</React.Suspense>
	);
}
