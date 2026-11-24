import * as React from 'react';
import { type PressableProps, type TextProps, type ViewProps } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { DayCalendar } from './index';
import { updateLocaleConfig } from './locales';

import type { CalendarProps, DateData } from 'react-native-calendars';

let calendar: CalendarProps;
// Like the library's memoized Day wrapper, unchanged props do not re-render the cell.
jest.mock('react-native-calendars', () => {
	const Day = React.memo(function Day({
		dayComponent: Cell,
		dateString,
		state,
		marking,
	}: {
		dayComponent: NonNullable<CalendarProps['dayComponent']>;
		dateString: string;
		state: 'disabled' | 'today' | undefined;
		marking?: NonNullable<CalendarProps['markedDates']>[string];
	}) {
		return (
			<Cell
				// Upstream intersects string and DateData; runtime supplies DateData.
				date={date(dateString) as string & DateData}
				state={state}
				marking={marking}
				accessibilityLabel="Monday 8 June 2026"
			>
				{date(dateString).day}
			</Cell>
		);
	});
	return {
		Calendar: (props: CalendarProps) => {
			calendar = props;
			return [
				'2026-05-31',
				'2026-06-08',
				'2026-06-09',
				'2026-06-10',
				'2026-06-24',
				'2026-06-25',
			].map((dateString) => (
				<Day
					key={dateString}
					dayComponent={props.dayComponent!}
					dateString={dateString}
					// Today precedes the range/month checks in the real state manager.
					state={
						dateString === '2026-06-24'
							? 'today'
							: dateString > props.maxDate! ||
								  !dateString.startsWith(props.initialDate!.slice(0, 7))
								? 'disabled'
								: undefined
					}
					marking={props.markedDates?.[dateString]}
				/>
			));
		},
	};
});
// Keep real web press/ARIA behavior; expose the classes Jest does not compile.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
		View: ({ className, ...props }: ViewProps) =>
			React.createElement(actual.View, { ...props, dataSet: { classes: className } }),
		Text: ({ className, ...props }: TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('../lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('uniwind', () => ({
	useCSSVariable: () => [
		'#123456',
		'#ffffff',
		'#eeeeee',
		'#111111',
		'#777777',
		'#dddddd',
		'18px',
		'13px',
		'6px',
	],
}));
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('./locales', () => ({ updateLocaleConfig: jest.fn() }));

const defaults = {
	value: '2026-06-08',
	currentDay: '2026-06-10',
	maxDate: '2026-06-24',
	testID: 'paid-on',
	onValueChange: jest.fn(),
};
const date = (dateString: string): DateData => ({
	dateString,
	year: Number(dateString.slice(0, 4)),
	month: Number(dateString.slice(5, 7)),
	day: Number(dateString.slice(8, 10)),
	timestamp: 0,
});
async function mount(props: Partial<React.ComponentProps<typeof DayCalendar>> = {}) {
	return act(async () => render(<DayCalendar {...defaults} {...props} />));
}
const getDay = (day: string) => screen.getByTestId(`paid-on-day-${day}`);
const classes = (el: Element | null) => el?.getAttribute('data-classes')?.split(' ') ?? [];
beforeEach(() => jest.clearAllMocks());

it('reports a pickable past day with a full-date accessibility label', async () => {
	await mount();
	const day = getDay('2026-06-08');
	expect(day).toHaveAttribute('aria-label', 'Monday 8 June 2026');
	fireEvent.click(day);
	expect(defaults.onValueChange).toHaveBeenCalledTimes(1);
	expect(defaults.onValueChange).toHaveBeenCalledWith('2026-06-08');
});

it('does not report future days or the current day', async () => {
	await mount();
	fireEvent.click(getDay('2026-06-25'));
	fireEvent.click(getDay('2026-06-10'));
	expect(defaults.onValueChange).not.toHaveBeenCalled();
	expect(screen.getByTestId('paid-on-day-2026-06-25')).toHaveAttribute('aria-disabled', 'true');
});

it('makes outside-month days unavailable with border ink', async () => {
	await mount();
	const day = getDay('2026-05-31');
	fireEvent.click(day);
	expect(defaults.onValueChange).not.toHaveBeenCalled();
	expect(day).toHaveAttribute('aria-disabled', 'true');
	expect(classes(day.querySelector('[dir="auto"]'))).toContain('text-border');
});

it("keeps today unavailable when it sits in a neighbouring month's cells", async () => {
	// The library reports 24 June as 'today', not 'disabled', while May is shown.
	await mount({ currentDay: undefined });
	fireEvent.click(getDay('2026-06-24'));
	expect(defaults.onValueChange).toHaveBeenCalledWith('2026-06-24');
	jest.clearAllMocks();
	act(() => calendar.onMonthChange!(date('2026-05-01')));
	const day = getDay('2026-06-24');
	fireEvent.click(day);
	expect(defaults.onValueChange).not.toHaveBeenCalled();
	expect(day).toHaveAttribute('aria-disabled', 'true');
});

it('gives its day cells a default test id when the caller passes none', async () => {
	await mount({ testID: undefined });
	expect(screen.getByTestId('day-calendar-day-2026-06-08')).toBeTruthy();
});

it('announces the picked day as a selected radio on the shared surface', async () => {
	await mount();
	const day = getDay('2026-06-08');
	expect(day).toHaveAttribute('role', 'radio');
	expect(day).toHaveAttribute('aria-checked', 'true');
	expect(classes(day)).toEqual(expect.arrayContaining(['active:bg-accent', 'web:hover:bg-accent']));
	expect(classes(getDay('2026-06-10'))).toContain('opacity-45');
});

it('moves selection without remounting or losing focus when value changes', async () => {
	const { rerender } = await mount();
	const oldDay = getDay('2026-06-08');
	const newDay = getDay('2026-06-09');
	const cell = calendar.dayComponent;
	newDay.focus();
	rerender(<DayCalendar {...defaults} value="2026-06-09" />);
	expect(calendar.dayComponent).toBe(cell);
	expect(getDay('2026-06-08')).toBe(oldDay);
	expect(getDay('2026-06-09')).toBe(newDay);
	expect(newDay).toHaveFocus();
	expect(oldDay).toHaveAttribute('aria-checked', 'false');
	expect(newDay).toHaveAttribute('aria-checked', 'true');
	expect(classes(oldDay.firstElementChild)).not.toContain('bg-primary');
	expect(classes(newDay.firstElementChild)).toContain('bg-primary');
});

it('stretches the control-height target around a centred 32-point circle', async () => {
	await mount();
	const day = getDay('2026-06-08');
	expect(classes(day)).toEqual(
		expect.arrayContaining(['self-stretch', 'min-h-ctl', 'items-center', 'justify-center'])
	);
	expect(day.style.width).toBe('');
	expect(classes(day.firstElementChild)).toEqual(
		expect.arrayContaining([
			'size-8',
			'rounded-full',
			'items-center',
			'justify-center',
			'bg-primary',
		])
	);
	expect(day.textContent).toBe('8');
	expect(classes(day.querySelector('[dir="auto"]'))).toContain('text-primary-foreground');
	expect(classes(day.querySelector('[dir="auto"]'))).toContain('text-base');
});

it('marks the non-pickable current day with a four-point primary dot', async () => {
	await mount();
	const day = getDay('2026-06-10');
	expect(day).toHaveAttribute('aria-disabled', 'true');
	expect(classes(day.querySelector('[dir="auto"]'))).toContain('text-muted-foreground');
	expect(classes(day.lastElementChild)).toEqual(
		expect.arrayContaining(['size-1', 'rounded-full', 'bg-primary'])
	);
});

it('uses foreground ink even for today and border ink after maxDate', async () => {
	await mount();
	expect(classes(getDay('2026-06-24').querySelector('[dir="auto"]'))).toContain('text-foreground');
	fireEvent.click(getDay('2026-06-24'));
	expect(defaults.onValueChange).toHaveBeenCalledWith('2026-06-24');
	expect(classes(getDay('2026-06-25').querySelector('[dir="auto"]'))).toContain('text-border');
});

it('refreshes currentDay and maxDate through the memoized library cells', async () => {
	const { rerender } = await mount();
	rerender(<DayCalendar {...defaults} currentDay="2026-06-09" maxDate="2026-06-23" />);
	expect(getDay('2026-06-09')).toHaveAttribute('aria-disabled', 'true');
	expect(getDay('2026-06-10')).not.toHaveAttribute('aria-disabled', 'true');
	// The library gives today its own state even when it is later than maxDate.
	fireEvent.click(getDay('2026-06-24'));
	expect(defaults.onValueChange).not.toHaveBeenCalled();
	expect(getDay('2026-06-24')).toHaveAttribute('aria-disabled', 'true');
});

it('dims and disables the next arrow at max month and enables it one month back', async () => {
	await mount();
	const arrow = (direction: 'left' | 'right') =>
		calendar.renderArrow!(direction) as React.ReactElement<{ fill?: string }>;
	expect(calendar.disableArrowRight).toBe(true);
	expect(calendar.disableArrowLeft).not.toBe(true);
	expect(arrow('right').props.fill).toBe('#dddddd');
	expect(arrow('left').props.fill).toBeUndefined();
	act(() => calendar.onMonthChange!(date('2026-05-01')));
	expect(calendar.disableArrowRight).toBe(false);
	expect(arrow('right').props.fill).toBeUndefined();
	act(() => calendar.onMonthChange!(date('2026-06-01')));
	expect(calendar.disableArrowRight).toBe(true);
});

it.each([
	[{ value: '2026-04-08', currentDay: '2026-05-10' }, '2026-04'],
	[{ value: undefined, currentDay: '2026-05-10' }, '2026-05'],
	[{ value: undefined, currentDay: undefined }, '2026-06'],
])('chooses the initial month in value/currentDay/maxDate order: %j', async (props, month) => {
	await mount(props);
	expect(calendar.initialDate?.slice(0, 7)).toBe(month);
});

it('uses the shared header theme and locale loading', async () => {
	jest.mocked(updateLocaleConfig).mockResolvedValue(true);
	await mount({ locale: 'de' });
	expect(updateLocaleConfig).toHaveBeenCalledWith('de', expect.any(Function));
	expect(calendar.theme).toMatchObject({
		textMonthFontSize: 18,
		textDayHeaderFontSize: 13,
		weekVerticalMargin: 3,
	});
});
