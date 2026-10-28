import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { Icon } from '../icon';
import { MenuRow, MenuRowGroup } from './index';

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

it('renders a label and the button role with the menu surface classes', () => {
	render(<MenuRow testID="row" label="Settings" onPress={() => {}} />);
	const row = screen.getByRole('button', { name: 'Settings' });
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
	const selected = screen.getByRole('radio', { name: 'Today', checked: true });
	const other = screen.getByRole('radio', { name: 'Yesterday', checked: false });
	expect(selected.querySelector('[data-classes~="w-5"] svg')).not.toBeNull();
	expect(other.querySelector('[data-classes~="w-5"]')).toBeEmptyDOMElement();
	expect(
		screen.getByRole('button', { name: 'Plain' }).querySelector('[data-classes~="w-5"]')
	).toBeNull();
});

// Every primitive's item is this row: the kind draws the slot and the wash, the role a
// primitive hands it is what it announces, and `selected` is announced the way that role reads it.
it.each([
	['action', {}, 'button', null, null],
	['choice', { choice: true }, 'radio', 'aria-checked', 'w-5'],
	['checkbox', { checkbox: true }, 'checkbox', 'aria-checked', 'rounded-sm'],
	['destructive', { variant: 'destructive' }, 'button', null, null],
	['menu item', { role: 'menuitem' }, 'menuitem', null, null],
	['menu radio', { role: 'menuitemradio', choice: true }, 'menuitemradio', 'aria-checked', 'w-5'],
	[
		'menu checkbox',
		{ role: 'menuitemcheckbox', checkbox: true },
		'menuitemcheckbox',
		'aria-checked',
		'rounded-sm',
	],
	['option', { role: 'option' }, 'option', 'aria-selected', null],
] as const)('%s', (kind, props, role, state, slot) => {
	const onPress = jest.fn();
	render(<MenuRow label="Row" selected onPress={onPress} {...props} />);
	const row = screen.getByRole(role, { name: 'Row' });
	if (state) expect(row).toHaveAttribute(state, 'true');
	else expect(row).not.toHaveAttribute('aria-checked');
	const mark = slot ? row.querySelector(`[data-classes~="${slot}"]`) : null;
	if (slot) expect(mark?.querySelector('svg')).not.toBeNull();
	else expect(row.querySelector('[aria-hidden] svg')).toBeNull();
	const wash = kind === 'destructive' ? 'active:bg-destructive/10' : 'active:bg-muted';
	expect(row.dataset.classes?.split(' ')).toContain(wash);
	fireEvent.click(row);
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('draws without a role or press when a primitive hosts it, dimmed when disabled', () => {
	render(<MenuRow hosted choice selected disabled label="Small" testID="row" />);
	expect(screen.queryByRole('radio')).toBeNull();
	expect(screen.queryByRole('button')).toBeNull();
	const row = screen.getByText('Small').closest('[data-classes~="px-2.5"]') as HTMLElement;
	expect(row.dataset.classes).toContain('opacity-45');
	expect(row.querySelector('[data-classes~="w-5"] svg')).not.toBeNull();
});

it('lays free children (an icon and a Text) on the row in place of the label', () => {
	render(
		<MenuRow onPress={() => {}}>
			<Icon name="delete" />
			<span>Remove</span>
		</MenuRow>
	);
	const row = screen.getByRole('button');
	expect(row).toHaveTextContent('Remove');
	expect(row.querySelector('[data-classes~="flex-1"]')).toBeNull();
});

it('a locked row is dimmed and still presses', () => {
	const onPress = jest.fn();
	render(<MenuRow choice label="Yesterday" locked onPress={onPress} />);
	const row = screen.getByRole('radio', { name: 'Yesterday' });
	expect(row.dataset.classes).toContain('opacity-45');
	expect(row.dataset.classes).not.toContain('pointer-events-none');
	expect(row).not.toHaveAttribute('aria-disabled', 'true');
	fireEvent.click(row);
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('paints destructive words and icons red, with a destructive hover and press wash', () => {
	render(<MenuRow label="Forget" variant="destructive" leading={<Icon name="delete" />} />);
	const row = screen.getByRole('button');
	expect(within(row).getByText('Forget').dataset.classes).toContain('text-destructive');
	expect(row.querySelector('svg')?.parentElement?.dataset.classes).toContain('text-destructive');
	for (const state of ['web:hover', 'web:focus', 'active'])
		expect(row.dataset.classes).toContain(`${state}:bg-destructive/10`);
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
	const row = screen.getByRole('button');
	expect(row).toHaveTextContent('AvatarRegisterNot openedShortcut');
	expect(screen.getByTestId('label').dataset.classes).toContain('min-w-0 flex-1');
	expect(within(row).getByText('Not opened').dataset.classes).toContain('text-muted-foreground');
});

it('wraps a numeric description in muted Text', () => {
	render(<MenuRow label="Count" description={3} />);
	expect(screen.getByText('3').dataset.classes).toContain('text-muted-foreground');
});

it.each(['aria-label', 'accessibilityLabel'] as const)(
	'labels the radio group with %s and preserves layout classes',
	(labelProp) => {
		render(
			<MenuRowGroup {...{ [labelProp]: 'Period' }} className="gap-2">
				<MenuRow choice selected label="Today" />
				<MenuRow choice label="Yesterday" />
			</MenuRowGroup>
		);
		const group = screen.getByRole('radiogroup', { name: 'Period' });
		expect(group.dataset.classes).toBe('gap-2');
		expect(within(group).getAllByRole('radio')).toHaveLength(2);
	}
);
