import * as React from 'react';

import { act, render } from '@testing-library/react';

import { Calendar } from './index';
import { updateLocaleConfig } from './locales';

import type { CalendarProps, DateData } from 'react-native-calendars';

let header = '13px';
let card = 'card';
let calendar: CalendarProps;
let mockMounts = 0;
jest.mock('react-native-calendars', () => ({
	Calendar: (props: Record<string, unknown>) => {
		const React = require('react') as typeof import('react');
		React.useEffect(() => {
			mockMounts++;
		}, []);
		calendar = props;
		return null;
	},
}));
jest.mock('uniwind', () => ({
	useCSSVariable: () => [
		'primary',
		'primary-foreground',
		card,
		'foreground',
		'muted',
		'border',
		'18px',
		header,
		'6px',
		'9px',
	],
}));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('./locales', () => ({ updateLocaleConfig: jest.fn() }));
beforeEach(() => {
	card = 'card';
	mockMounts = 0;
	jest.mocked(updateLocaleConfig).mockReset();
});

const juneRange = { from: new Date(2026, 5, 8), to: new Date(2026, 5, 13) };
const april: DateData = {
	dateString: '2026-04-01',
	year: 2026,
	month: 4,
	day: 1,
	timestamp: new Date('2026-04-01').getTime(),
};

it('keeps the browsed month when the theme remounts the range calendar', async () => {
	const onMonthChange = jest.fn();
	const props = { dateRange: juneRange, onMonthChange };
	const { rerender } = await act(async () => render(<Calendar {...props} />));
	act(() => calendar.onMonthChange!(april));
	card = 'dark-card';
	rerender(<Calendar {...props} />);
	expect(mockMounts).toBe(2);
	expect(calendar.initialDate).toBe('2026-04');
	expect(onMonthChange).toHaveBeenCalledTimes(1);
	expect(onMonthChange).toHaveBeenCalledWith(april);
	rerender(<Calendar {...props} />);
	expect(calendar.initialDate).toBe('2026-04');
});

it('keeps initialDate at the range month while browsing without a remount', async () => {
	const onMonthChange = jest.fn();
	const props = { dateRange: juneRange, onMonthChange };
	const { rerender } = await act(async () => render(<Calendar {...props} />));
	act(() => calendar.onMonthChange!(april));
	expect(calendar.initialDate).toBe('2026-06');
	rerender(<Calendar {...props} disableArrowRight={false} disableArrowLeft />);
	expect(calendar.initialDate).toBe('2026-06');
	expect(calendar.disableArrowRight).toBe(false);
	expect(calendar.disableArrowLeft).toBe(true);
	expect(mockMounts).toBe(1);
	expect(onMonthChange).toHaveBeenCalledTimes(1);
	expect(onMonthChange).toHaveBeenCalledWith(april);
});

it('drops the browsed month when the range start changes, including later remounts', async () => {
	const { rerender } = await act(async () =>
		render(<Calendar dateRange={juneRange} onMonthChange={jest.fn()} />)
	);
	act(() => calendar.onMonthChange!(april));
	card = 'dark-card';
	rerender(<Calendar dateRange={juneRange} />);
	expect(calendar.initialDate).toBe('2026-04');
	const mayRange = { ...juneRange, from: new Date(2026, 4, 8) };
	rerender(<Calendar dateRange={mayRange} />);
	expect(calendar.initialDate).toBe('2026-05');
	card = 'card';
	rerender(<Calendar dateRange={mayRange} />);
	expect(calendar.initialDate).toBe('2026-05');
	expect(mockMounts).toBe(3);
});

it('feeds token numbers to the library and keeps caller theme last', async () => {
	const { rerender } = await act(async () => render(<Calendar />));
	expect(calendar.theme).toMatchObject({
		textDayFontSize: 18,
		textMonthFontSize: 18,
		textDayHeaderFontSize: 13,
		weekVerticalMargin: 3,
		textDayFontWeight: '400',
		'stylesheet.calendar.header': { header: { paddingLeft: 15, paddingRight: 15 } },
	});
	rerender(<Calendar theme={{ textDayFontSize: 24 }} />);
	expect(calendar.theme).toMatchObject({ textDayFontSize: 24 });
});

it('resolves the calculated web xs token before handing it to the calendar', async () => {
	header = 'calc(18px * 0.857)';
	await act(async () => {
		render(<Calendar />);
	});
	expect(calendar.theme).toMatchObject({ textDayHeaderFontSize: 18 * 0.857 });
	header = '13px';
});

it('remounts the calendar after the locale loads', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(true);
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(2);
});

it('remounts the calendar when the theme changes, so the library rebuilds its colours', async () => {
	const { rerender } = await act(async () => render(<Calendar />));
	expect(mockMounts).toBe(1);
	card = 'dark-card';
	rerender(<Calendar />);
	expect(mockMounts).toBe(2);
	expect(calendar.theme).toMatchObject({ calendarBackground: 'dark-card' });
	card = 'card';
});

it('does not remount when the locale load was superseded', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(false);
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(1);
});

it('marks the older locale load stale when the locale changes', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(true);
	const { rerender } = await act(async () => render(<Calendar locale="de" />));
	await act(async () => {
		rerender(<Calendar locale="fr" />);
	});
	expect(jest.mocked(updateLocaleConfig).mock.calls[0][1]?.()).toBe(false);
	expect(jest.mocked(updateLocaleConfig).mock.calls[1][1]?.()).toBe(true);
});

it('keeps the first mount if the locale chunk fails', async () => {
	jest.mocked(updateLocaleConfig).mockRejectedValue(new Error('chunk'));
	await act(async () => {
		render(<Calendar locale="de" />);
	});
	expect(mockMounts).toBe(1);
});
