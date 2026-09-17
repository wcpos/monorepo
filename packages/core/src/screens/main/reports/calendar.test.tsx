/** @jest-environment jsdom */
import * as React from 'react';

import { render } from '@testing-library/react';

import { Calendar } from '@wcpos/components/calendar';

const native = jest.fn();
jest.mock('react-native-calendars', () => ({
	Calendar: (props: unknown) => {
		native(props);
		return null;
	},
	LocaleConfig: { locales: {} },
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => [] }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// Revert: parse a picker day with new Date(YYYY-MM-DD), which produces a UTC instant.
it('returns picked calendar days at device-local midnight for store-day conversion', () => {
	const select = jest.fn();
	render(
		<Calendar
			dateRange={{ from: new Date(2026, 8, 15), to: new Date(2026, 8, 17) }}
			maxDate="2026-09-17"
			onDateRangeChange={select}
		/>
	);
	native.mock.calls.at(-1)![0].onDayPress({ dateString: '2026-09-16' });
	expect(select).toHaveBeenLastCalledWith({
		from: new Date(2026, 8, 15),
		to: new Date(2026, 8, 16),
	});
});
