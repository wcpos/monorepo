import * as React from 'react';

import { act, render } from '@testing-library/react';

import { Calendar } from './index';
import { updateLocaleConfig } from './locales';

let header = '13px';
let calendar: Record<string, unknown>;
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
		'card',
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
	mockMounts = 0;
	jest.mocked(updateLocaleConfig).mockReset();
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
