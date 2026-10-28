import * as React from 'react';
import { Platform } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react';

import { PressableSurface, type PressableSurfaceProps } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep react-native-web's press behaviour; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({ testID, className }: { testID?: string; className?: string }) =>
			React.createElement('div', { 'data-testid': testID, 'data-classes': className }),
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

const surface = (props: Partial<PressableSurfaceProps> = {}) => {
	const view = render(<PressableSurface testID="s" {...props} />);
	return { el: screen.getByTestId('s'), ...view };
};
const classes = (el: HTMLElement) => (el.dataset.classes ?? '').split(' ');
const press = () => {};

beforeEach(() => {
	mockPointer = 'fine';
	mockImpact.mockClear();
});

// role × selected → what a screen reader is told.
it.each([
	[undefined, true, 'button', { 'aria-selected': 'true' }],
	[undefined, false, 'button', { 'aria-selected': 'false' }],
	[undefined, undefined, 'button', {}],
	['option', true, 'option', { 'aria-selected': 'true' }],
	['tab', false, 'tab', { 'aria-selected': 'false' }],
	['radio', true, 'radio', { 'aria-checked': 'true' }],
	['checkbox', false, 'checkbox', { 'aria-checked': 'false' }],
	['menuitemradio', true, 'menuitemradio', { 'aria-checked': 'true' }],
] as const)('role %s, selected %s: announced as %s %j', (role, selected, shown, state) => {
	const { el } = surface({ role, selected, onPress: press });
	expect(el).toHaveAttribute('role', shown);
	for (const name of ['aria-selected', 'aria-checked'])
		if (name in state) expect(el).toHaveAttribute(name, state[name as keyof typeof state]);
		else expect(el).not.toHaveAttribute(name);
});

it("keeps a caller's own checked state and legacy accessibilityRole", () => {
	const { el } = surface({ accessibilityRole: 'checkbox', 'aria-checked': true, onPress: press });
	expect(el).toHaveAttribute('role', 'checkbox');
	expect(el).toHaveAttribute('aria-checked', 'true');
});

it.each([
	['no action and no role', {}, false],
	['an action', { onPress: press }, true],
	['a long press only', { onLongPress: press }, true],
	['a named role', { role: 'button' }, true],
] as const)('with %s it is a tab stop: %s', (_, props, focusable) => {
	const { el } = surface(props);
	if (focusable) expect(el).not.toHaveAttribute('tabindex', '-1');
	else {
		expect(el).toHaveAttribute('tabindex', '-1');
		expect(el).not.toHaveAttribute('role');
	}
});

it.each([
	['enabled', {}, true, false],
	['disabled', { disabled: true }, false, true],
	['dimmed', { dimmed: true }, true, true],
] as const)('%s: presses %s, dimmed %s', (_, props, presses, dim) => {
	const onPress = jest.fn();
	const { el } = surface({ ...props, onPress });
	fireEvent.click(el);
	expect(onPress).toHaveBeenCalledTimes(presses ? 1 : 0);
	expect(classes(el).includes('opacity-45')).toBe(dim);
	expect(classes(el).includes('web:pointer-events-none')).toBe(!presses);
});

it.each([
	['muted', 'active:bg-muted', 'web:hover:bg-muted'],
	['card', 'active:bg-card', 'web:hover:bg-card'],
	['destructive', 'active:bg-destructive/10', 'web:hover:bg-destructive/10'],
] as const)('washes %s on press, and on hover for a fine pointer only', (wash, active, hover) => {
	const fine = surface({ wash, onPress: press });
	expect(classes(fine.el)).toEqual(expect.arrayContaining([active, hover]));
	fine.unmount();
	mockPointer = 'coarse';
	const coarse = surface({ wash, onPress: press });
	expect(classes(coarse.el)).toContain(active);
	expect(coarse.el.dataset.classes).not.toContain('hover:');
});

it('leaves the wash to the caller when told to', () => {
	const { el } = surface({ wash: 'none', onPress: press });
	expect(el.dataset.classes).not.toMatch(/active:|hover:/);
});

it.each([
	['enabled', {}, true],
	['opted out', { haptic: false }, false],
	['disabled', { disabled: true }, false],
] as const)('gives the light haptic on native when %s: %s', (_, props, felt) => {
	const os = Platform.OS;
	(Platform as { OS: string }).OS = 'ios';
	try {
		const onPress = jest.fn();
		const { el } = surface({ ...props, onPress });
		fireEvent.click(el);
		expect(mockImpact).toHaveBeenCalledTimes(felt ? 1 : 0);
		if (felt) expect(mockImpact).toHaveBeenCalledWith('light');
	} finally {
		(Platform as { OS: string }).OS = os;
	}
});

it('never buzzes on the web', () => {
	const { el } = surface({ onPress: press });
	fireEvent.click(el);
	expect(mockImpact).not.toHaveBeenCalled();
});

it('presses a radio on Space, after the caller and only from the surface itself', () => {
	const onPress = jest.fn();
	const onKeyDown = jest.fn();
	render(
		<PressableSurface testID="s" role="radio" onPress={onPress} onKeyDown={onKeyDown}>
			<input data-testid="inner" />
		</PressableSurface>
	);
	fireEvent.keyDown(screen.getByTestId('inner'), { key: ' ' });
	expect(onPress).not.toHaveBeenCalled();
	fireEvent.keyDown(screen.getByTestId('s'), { key: ' ' });
	expect(onKeyDown).toHaveBeenCalled();
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('does not press on Space when the caller claimed the key', () => {
	const onPress = jest.fn();
	const { el } = surface({
		role: 'checkbox',
		onPress,
		onKeyDown: (event) => event.preventDefault(),
	});
	fireEvent.keyDown(el, { key: ' ' });
	expect(onPress).not.toHaveBeenCalled();
});

it('carries the 44 pt band as its last child only when asked, with render-prop children too', () => {
	const { el, rerender } = surface({ minTarget: true, children: <span data-testid="glyph" /> });
	expect(el.lastElementChild).toBe(screen.getByTestId('min-target-band'));
	rerender(
		<PressableSurface testID="s" minTarget>
			{() => <span data-testid="glyph" />}
		</PressableSurface>
	);
	expect(screen.getByTestId('glyph')).toBeTruthy();
	expect(screen.getByTestId('s').lastElementChild).toBe(screen.getByTestId('min-target-band'));
	rerender(<PressableSurface testID="s" />);
	expect(screen.queryByTestId('min-target-band')).toBeNull();
});
