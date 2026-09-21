import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Chip } from './index';

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

it.each([
	[{}, 'border-border', 'text-foreground'],
	[{ on: true }, 'border-primary', 'text-primary font-semibold'],
	[{ dimmed: true }, 'opacity-45', 'text-foreground'],
	[{ add: true }, 'border-dashed', 'text-muted-foreground'],
])('renders chip state %j', (state, root, label) => {
	render(<Chip label="Morning menu" testID="chip" {...state} />);
	expect(screen.getByTestId('chip').dataset.classes).toContain(root);
	expect(screen.getByTestId('chip-label').dataset.classes).toContain(label);
	expect(screen.getByTestId('chip-label').dataset.classes).not.toMatch(/truncate|text-sm/);
});
it('renders count zero and a leading icon', () => {
	const { container } = render(<Chip label="Menu" count={0} icon="plus" testID="chip" />);
	expect(screen.getByTestId('chip-count')).toHaveTextContent('0');
	expect(container.querySelector('[data-icon="plus"]')).not.toBeNull();
});
it('clear does not press the chip or surrounding trigger; label still presses', () => {
	const onPress = jest.fn();
	const onClear = jest.fn();
	const outer = jest.fn();
	render(
		<div onClick={outer}>
			<Chip label="Menu" testID="chip" onPress={onPress} onClear={onClear} />
		</div>
	);
	expect(screen.getByTestId('chip-clear')).toHaveAccessibleName('Remove');
	fireEvent.click(screen.getByTestId('chip-clear'));
	expect(onClear).toHaveBeenCalledTimes(1);
	expect(onPress).not.toHaveBeenCalled();
	expect(outer).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('chip-label'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(screen.getByTestId('chip')).toHaveAttribute('tabindex', '-1');
	expect(screen.getByTestId('chip-label').closest('[role="button"]')).toHaveAttribute(
		'tabindex',
		'0'
	);
	expect(screen.getByTestId('chip-clear')).toHaveAttribute('tabindex', '0');
});
it('stops native clear propagation before clearing', () => {
	const onPress = jest.fn();
	const outer = jest.fn();
	let stopped = false;
	const onClear = jest.fn(() => {
		expect(stopped).toBe(true);
	});
	render(<Chip label="Menu" testID="chip" onPress={onPress} onClear={onClear} />);
	// RNW stops propagation internally. Invoke the actual handler with a native-like event
	// to prove that Chip itself stops it, not only the browser adapter.
	jest.requireMock('react-native').presses.get('chip-clear')({
		stopPropagation: () => {
			stopped = true;
		},
	});
	if (!stopped) {
		onPress();
		outer();
	}
	expect(onClear).toHaveBeenCalledTimes(1);
	expect(onPress).not.toHaveBeenCalled();
	expect(outer).not.toHaveBeenCalled();
});
it('honors a custom clear name and identifier', () => {
	render(
		<Chip label="Menu" onClear={jest.fn()} clearLabel="Clear menu" clearTestID="clear-menu" />
	);
	expect(screen.getByTestId('clear-menu')).toHaveAccessibleName('Clear menu');
});
it.each([{ dimmed: true }, { disabled: true }])('disables label and clear for %j', (state) => {
	const onPress = jest.fn();
	const onClear = jest.fn();
	render(<Chip {...state} label="Menu" testID="chip" onPress={onPress} onClear={onClear} />);
	expect(screen.getByTestId('chip')).toHaveAttribute('aria-disabled', 'true');
	fireEvent.click(screen.getByTestId('chip-label'));
	fireEvent.click(screen.getByTestId('chip-clear'));
	expect(onPress).not.toHaveBeenCalled();
	expect(onClear).not.toHaveBeenCalled();
});
