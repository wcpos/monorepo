import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { type Segment, SegmentedControl } from './index';

// Keep RNW press/focus behavior; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const presses = new Map();
	return {
		...actual,
		presses,
		View: ({ testID, ...props }: { testID?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID }),
		Pressable: ({
			className,
			...props
		}: import('react-native').PressableProps & {
			ref?: React.Ref<import('react-native').View>;
		}) => {
			presses.set(props.testID, props.onPress);
			return React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } });
		},
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }),
}));

const segments = [
	{ value: 'a', label: 'A' },
	{ value: 'b', label: 'B' },
	{ value: 'c', label: 'C', disabled: true },
	{ value: 'd', label: 'D' },
] as const;
function Picker() {
	const [value, setValue] = React.useState('a');
	return (
		<SegmentedControl segments={segments} value={value} onValueChange={setValue} testID="picker" />
	);
}
it.each([2, 3, 4])('renders %i divided segments with one tab stop', (length) => {
	const choices = segments.slice(0, length) as
		[Segment, Segment] | [Segment, Segment, Segment] | [Segment, Segment, Segment, Segment];
	render(
		<SegmentedControl segments={choices} value="a" onValueChange={jest.fn()} testID="picker" />
	);
	expect(screen.getByRole('radiogroup')).toBeInTheDocument();
	const radios = screen.getAllByRole('radio');
	expect(radios).toHaveLength(length);
	radios.forEach((radio, index) => {
		expect(radio.dataset.classes?.includes('border-l')).toBe(index > 0);
		expect(radio).toHaveAttribute('tabindex', index === 0 ? '0' : '-1');
		expect(radio).toHaveAttribute('aria-checked', index === 0 ? 'true' : 'false');
	});
	expect(radios[0].dataset.classes).toContain('bg-muted');
});
it('commits an unselected segment but selected and disabled presses call nothing', () => {
	const onValueChange = jest.fn();
	render(
		<SegmentedControl segments={segments} value="a" onValueChange={onValueChange} testID="picker" />
	);
	fireEvent.click(screen.getByTestId('picker-segment-a'));
	fireEvent.click(screen.getByTestId('picker-segment-c'));
	expect(onValueChange).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('picker-segment-b'));
	expect(onValueChange).toHaveBeenCalledTimes(1);
	expect(onValueChange).toHaveBeenCalledWith('b');
});
it('moves selection and real focus with arrows, skips disabled, wraps, and handles Home/End', () => {
	render(<Picker />);
	const key = (from: string, key: string, to: string) => {
		fireEvent.keyDown(screen.getByTestId(`picker-segment-${from}`), { key });
		expect(screen.getByTestId(`picker-segment-${to}`)).toHaveFocus();
		expect(screen.getByTestId(`picker-segment-${to}`)).toHaveAttribute('aria-checked', 'true');
		expect(screen.getAllByRole('radio').filter((node) => node.tabIndex === 0)).toHaveLength(1);
	};
	key('a', 'ArrowRight', 'b');
	key('b', 'ArrowRight', 'd');
	key('d', 'ArrowLeft', 'b');
	key('b', 'Home', 'a');
	key('a', 'End', 'd');
	key('d', 'ArrowDown', 'a');
	key('a', 'ArrowUp', 'd');
});
it('Enter on the selected segment is a no-op', () => {
	const onValueChange = jest.fn();
	render(
		<SegmentedControl segments={segments} value="a" onValueChange={onValueChange} testID="picker" />
	);
	fireEvent.keyDown(screen.getByTestId('picker-segment-a'), { key: 'Enter' });
	fireEvent.keyUp(screen.getByTestId('picker-segment-a'), { key: 'Enter' });
	expect(onValueChange).not.toHaveBeenCalled();
});
it('honors a segment identifier and icon', () => {
	const { container } = render(
		<SegmentedControl
			segments={[
				{ value: 'a', label: 'A', testID: 'first', icon: 'plus' },
				{ value: 'b', label: 'B' },
			]}
			value="a"
			onValueChange={jest.fn()}
		/>
	);
	expect(screen.getByTestId('first')).toBeInTheDocument();
	expect(container.querySelector('[data-icon="plus"]')).not.toBeNull();
});
