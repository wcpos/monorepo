import * as React from 'react';

import { render } from '@testing-library/react';

import { Calendar } from './index';

let header = '13px';
let calendar: Record<string, unknown>;
jest.mock('react-native-calendars', () => ({
	Calendar: (props: Record<string, unknown>) => {
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
it('feeds token numbers to the library and keeps caller theme last', () => {
	const { rerender } = render(<Calendar />);
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

it('resolves the calculated web xs token before handing it to the calendar', () => {
	header = 'calc(18px * 0.857)';
	render(<Calendar />);
	expect(calendar.theme).toMatchObject({ textDayHeaderFontSize: 18 * 0.857 });
	header = '13px';
});
