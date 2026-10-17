import * as React from 'react';
import { Platform } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { Tile } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep RNW press behaviour; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));
const mockImpact = jest.fn();
jest.mock('expo-haptics', () => ({
	impactAsync: (...args: unknown[]) => mockImpact(...args),
	ImpactFeedbackStyle: { Light: 'light' },
}));

const classes = (testID: string) => screen.getByTestId(testID).dataset.classes ?? '';

beforeEach(() => {
	mockPointer = 'fine';
});

it('is a card with a hairline border and the 8 pt radius, pressed and hovered on bg-muted', () => {
	render(<Tile testID="tile" onPress={() => {}} />);
	for (const token of ['bg-card', 'rounded-lg', 'border', 'border-border', 'active:bg-muted'])
		expect(classes('tile').split(' ')).toContain(token);
	expect(classes('tile')).toContain('web:hover:bg-muted');
	expect(screen.getByTestId('tile')).toHaveAttribute('role', 'button');
});

it('keeps hover off a coarse pointer', () => {
	mockPointer = 'coarse';
	render(<Tile testID="tile" onPress={() => {}} />);
	expect(classes('tile')).not.toContain('hover:');
});

it('has a 64 pt square key and a labelled tile at least 64 tall', () => {
	render(
		<>
			<Tile testID="key" size="tile" />
			<Tile testID="labelled" />
		</>
	);
	expect(classes('key')).toContain('size-tile');
	expect(classes('labelled')).toContain('min-h-tile');
	expect(classes('labelled')).toContain('flex-col');
});

it('marks the picked tile with the primary border on bg-muted', () => {
	render(<Tile testID="tile" selected onPress={() => {}} />);
	expect(classes('tile')).toContain('border-primary');
	expect(classes('tile')).toContain('bg-muted');
	expect(classes('tile')).not.toContain('border-border');
	expect(screen.getByTestId('tile')).toHaveAttribute('aria-selected', 'true');
});

it('has a dashed add-another tile with no surface', () => {
	render(<Tile testID="tile" variant="dashed" />);
	expect(classes('tile')).toContain('border-dashed');
	expect(classes('tile')).toContain('bg-transparent');
	expect(classes('tile')).not.toContain('bg-card');
});

it('presses, and dims and refuses a press when disabled', () => {
	const onPress = jest.fn();
	const { rerender } = render(<Tile testID="tile" onPress={onPress} />);
	fireEvent.click(screen.getByTestId('tile'));
	expect(onPress).toHaveBeenCalledTimes(1);
	rerender(<Tile testID="tile" onPress={onPress} disabled />);
	fireEvent.click(screen.getByTestId('tile'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(classes('tile')).toContain('opacity-50');
});

it('is no tab stop without an action, and leaves a radio its checked state', () => {
	render(
		<>
			<Tile testID="inert" />
			<Tile testID="radio" role="radio" aria-checked selected onPress={() => {}} />
		</>
	);
	expect(screen.getByTestId('inert')).not.toHaveAttribute('tabindex', '0');
	expect(screen.getByTestId('radio')).not.toHaveAttribute('aria-selected');
	expect(screen.getByTestId('radio')).toHaveAttribute('aria-checked', 'true');
});

it('gives the light press haptic on native, as a Button does, unless opted out or disabled', () => {
	const os = Platform.OS;
	(Platform as { OS: string }).OS = 'ios';
	try {
		mockImpact.mockClear();
		const onPress = jest.fn();
		const { rerender } = render(<Tile testID="tile" onPress={onPress} />);
		fireEvent.click(screen.getByTestId('tile'));
		expect(mockImpact).toHaveBeenCalledWith('light');
		expect(onPress).toHaveBeenCalledTimes(1);
		mockImpact.mockClear();
		rerender(<Tile testID="tile" onPress={onPress} disableHaptics />);
		fireEvent.click(screen.getByTestId('tile'));
		expect(mockImpact).not.toHaveBeenCalled();
		expect(onPress).toHaveBeenCalledTimes(2);
	} finally {
		(Platform as { OS: string }).OS = os;
	}
});
