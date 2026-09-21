import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Keypad, type KeypadKeyDescriptor } from './index';

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

const rows: readonly (readonly KeypadKeyDescriptor[])[] = [
	[
		{ value: '1', label: '1' },
		{ value: '2', label: '2' },
		{ value: '3', label: '3' },
	],
	[
		{ value: '0', label: '0', span: 2 },
		{ value: 'backspace', icon: 'deleteLeft' },
	],
];
it('renders in reading order and every key emits only its descriptor value', () => {
	const onPress = jest.fn();
	render(<Keypad rows={rows} onPress={onPress} testID="pad" />);
	expect(screen.getAllByRole('button').map((key) => key.dataset.testid)).toEqual([
		'pad-key-1',
		'pad-key-2',
		'pad-key-3',
		'pad-key-0',
		'pad-key-backspace',
	]);
	screen.getAllByRole('button').forEach((key) => {
		expect(key).toHaveAttribute('tabindex', '0');
		fireEvent.click(key);
	});
	expect(onPress.mock.calls).toEqual([['1'], ['2'], ['3'], ['0'], ['backspace']]);
	expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('gives an icon-only key a stable ID without a root ID and honors explicit IDs', () => {
	render(
		<Keypad
			rows={[
				[
					{ value: 'clear', icon: 'xmark' },
					{ value: 'back', icon: 'deleteLeft', testID: 'custom-back' },
				],
			]}
			onPress={jest.fn()}
		/>
	);
	expect(screen.getByTestId('keypad-key-clear')).toBeInTheDocument();
	expect(screen.getByTestId('custom-back')).toBeInTheDocument();
});
it('uses a double flex basis for a span of two', () => {
	render(<Keypad rows={rows} onPress={jest.fn()} testID="pad" />);
	expect(screen.getByTestId('pad-key-0').dataset.classes).toContain('flex-[2]');
});
it('fit defaults to tile and shrink uses flexible rows and control-height floors', () => {
	const { rerender } = render(<Keypad rows={rows} onPress={jest.fn()} testID="pad" />);
	expect(screen.getByTestId('pad-key-1').dataset.classes).toContain('h-tile');
	expect(screen.getByTestId('pad-key-1').parentElement).not.toHaveClass('flex-1');
	rerender(<Keypad rows={rows} onPress={jest.fn()} testID="pad" fit="shrink" />);
	expect(screen.getByTestId('pad-key-1').dataset.classes).not.toMatch(/(?:^| )h-tile(?: |$)/);
	expect(screen.getByTestId('pad-key-1').dataset.classes).toContain('min-h-ctl');
	expect(screen.getByTestId('pad-key-1').parentElement).toHaveClass('flex-1');
});
it('disabled keys do not emit', () => {
	const onPress = jest.fn();
	render(
		<Keypad rows={[[{ value: '1', label: '1', disabled: true }]]} onPress={onPress} testID="pad" />
	);
	fireEvent.click(screen.getByTestId('pad-key-1'));
	expect(onPress).not.toHaveBeenCalled();
});
