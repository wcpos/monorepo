import * as React from 'react';
import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Icon } from '../icon';
import { MenuRow } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep RNW press behaviour; Jest does not compile Uniwind classes.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } }),
		View: ({ className, ...props }: import('react-native').ViewProps) =>
			React.createElement(actual.View, { ...props, dataSet: { classes: className } }),
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('react-native-svg', () => {
	const elements = jest.requireActual('react-native-svg/lib/commonjs/elements.web');
	return { ...elements, default: elements.Svg, __esModule: true };
});
jest.mock('../loader', () => ({ Loader: () => null }));
jest.mock('uniwind', () => ({ useCSSVariable: () => '#000000' }));

beforeEach(() => {
	mockPointer = 'fine';
});

it('renders a label and the menuitem role with the menu surface classes', () => {
	render(<MenuRow testID="row" label="Settings" onPress={() => {}} />);
	const row = screen.getByRole('menuitem', { name: 'Settings' });
	expect(row).toHaveAttribute('data-testid', 'row');
	for (const token of [
		'w-full',
		'min-h-row',
		'rounded-md',
		'px-2.5',
		'py-1.5',
		'gap-2',
		'active:bg-muted',
		'web:hover:bg-muted',
		'web:focus:bg-muted',
		'web:outline-none',
	]) {
		expect(row.dataset.classes?.split(' ')).toContain(token);
	}
	expect(row).not.toHaveAttribute('aria-checked');
});

it('shows a check only for the selected choice and reserves its slot on the other choices', () => {
	render(
		<>
			<MenuRow choice selected label="Today" />
			<MenuRow choice label="Yesterday" />
			<MenuRow selected label="Plain" />
		</>
	);
	const selected = screen.getByRole('menuitemradio', { name: 'Today', checked: true });
	const other = screen.getByRole('menuitemradio', { name: 'Yesterday', checked: false });
	expect(selected.querySelector('[data-classes~="w-5"] svg')).not.toBeNull();
	expect(other.querySelector('[data-classes~="w-5"]')).toBeEmptyDOMElement();
	expect(
		screen.getByRole('menuitem', { name: 'Plain' }).querySelector('[data-classes~="w-5"]')
	).toBeNull();
});

it('presses when enabled and blocks a disabled press', () => {
	const onPress = jest.fn();
	const { rerender } = render(<MenuRow label="Switch" onPress={onPress} />);
	fireEvent.click(screen.getByRole('menuitem'));
	expect(onPress).toHaveBeenCalledTimes(1);
	rerender(<MenuRow label="Switch" onPress={onPress} disabled />);
	fireEvent.click(screen.getByRole('menuitem'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(screen.getByRole('menuitem')).toHaveAttribute('aria-disabled', 'true');
	expect(screen.getByRole('menuitem').dataset.classes).toContain('opacity-45');
});

it('paints destructive words and icons red, with a destructive hover and press wash', () => {
	render(<MenuRow label="Forget" variant="destructive" leading={<Icon name="trash" />} />);
	const row = screen.getByRole('menuitem');
	expect(within(row).getByText('Forget').dataset.classes).toContain('text-destructive');
	expect(row.querySelector('svg')?.parentElement?.dataset.classes).toContain('text-destructive');
	for (const state of ['web:hover', 'web:focus', 'active'])
		expect(row.dataset.classes).toContain(`${state}:bg-destructive/10`);
});

it('keeps hover off coarse pointers without removing press or keyboard focus feedback', () => {
	mockPointer = 'coarse';
	render(<MenuRow label="Settings" />);
	const classes = screen.getByRole('menuitem').dataset.classes;
	expect(classes).not.toContain('hover:');
	expect(classes).toContain('active:bg-muted');
	expect(classes).toContain('web:focus:bg-muted');
});

it('renders a node label, description and leading/trailing slots', () => {
	render(
		<MenuRow
			leading={<span>Avatar</span>}
			label={<MenuRow.Label testID="label">Register</MenuRow.Label>}
			description="Not opened"
			trailing={<span>Shortcut</span>}
		/>
	);
	const row = screen.getByRole('menuitem');
	expect(row).toHaveTextContent('AvatarRegisterNot openedShortcut');
	expect(screen.getByTestId('label').dataset.classes).toContain('min-w-0 flex-1');
	expect(within(row).getByText('Not opened').dataset.classes).toContain('text-muted-foreground');
});

it.each([false, true])(
	'activates choice=%s with Enter and Space, but not when disabled',
	(choice) => {
		const onPress = jest.fn();
		const { rerender } = render(
			<MenuRow testID="row" label="Select" choice={choice} onPress={onPress} />
		);
		const row = screen.getByTestId('row');
		for (const key of ['Enter', ' ']) {
			fireEvent.keyDown(row, { key });
			fireEvent.keyUp(row, { key });
		}
		expect(onPress).toHaveBeenCalledTimes(2);
		rerender(<MenuRow testID="row" label="Select" choice={choice} onPress={onPress} disabled />);
		for (const key of ['Enter', ' ']) {
			fireEvent.keyDown(row, { key });
			fireEvent.keyUp(row, { key });
		}
		expect(onPress).toHaveBeenCalledTimes(2);
	}
);

it('keeps the native light haptic of the replaced Buttons, but not on disabled rows', () => {
	const platform = jest.replaceProperty(Platform, 'OS', 'ios');
	try {
		const { rerender } = render(<MenuRow label="Settings" />);
		fireEvent.click(screen.getByRole('menuitem'));
		expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
		rerender(<MenuRow label="Settings" disabled />);
		fireEvent.click(screen.getByRole('menuitem'));
		expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
	} finally {
		platform.restore();
	}
});
