import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NavItem } from './index';

let mockPointer: 'fine' | 'coarse' = 'fine';
// Keep RNW press behaviour; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({ testID, ...props }: { testID?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID }),
		Pressable: ({ className, ...props }: import('react-native').PressableProps) =>
			React.createElement(actual.Pressable, {
				...props,
				dataSet: { classes: className, state: JSON.stringify(props.accessibilityState) },
			}),
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('../lib/device', () => ({ usePointer: () => mockPointer }));
jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) =>
		React.createElement('span', { 'data-icon': name, 'data-classes': className }),
}));

const classes = (testID: string) => screen.getByTestId(testID).dataset.classes ?? '';
const icon = (container: HTMLElement, name: string) =>
	container.querySelector(`[data-icon="${name}"]`)?.getAttribute('data-classes') ?? '';

beforeEach(() => {
	mockPointer = 'fine';
});

it.each([
	['row', 'h-10 rounded-md', 'text-foreground', 'text-muted-foreground'],
	['drawer', 'h-12 rounded-lg', 'text-primary', 'text-sidebar-foreground'],
] as const)(
	'paints the %s size, lifting the selected row onto the card',
	(size, shape, on, off) => {
		const { container, unmount } = render(
			<NavItem size={size} selected icon="settings" label="General" testID="item" />
		);
		expect(classes('item')).toContain(shape);
		expect(classes('item')).toContain('bg-card');
		expect(classes('item-label')).toContain(on);
		expect(icon(container, 'settings')).toContain(on);
		expect(screen.getByTestId('item').getAttribute('aria-selected')).toBe('true');
		unmount();

		const rest = render(<NavItem size={size} icon="settings" label="General" testID="item" />);
		expect(classes('item').split(' ')).not.toContain('bg-card');
		expect(classes('item')).toContain('active:bg-card');
		expect(classes('item-label')).toContain(off);
		expect(icon(rest.container, 'settings')).toContain(off);
	}
);

it('keeps the hover lift to a fine pointer: a touch screen never sticks on hover', () => {
	const { unmount } = render(<NavItem label="Tax" testID="item" />);
	expect(classes('item')).toContain('web:hover:bg-card');
	unmount();
	mockPointer = 'coarse';
	render(<NavItem label="Tax" testID="item" />);
	expect(classes('item')).not.toContain('web:hover:bg-card');
});

it('carries no left border and no tinted row (retired 2026-10-16)', () => {
	render(<NavItem size="drawer" selected label="POS" testID="item" />);
	expect(classes('item')).not.toMatch(/border-l|border-x|bg-white|bg-primary\/10/);
});

it('renders a supplied icon element as is, the trailing badge and chevron, and presses', () => {
	const onPress = jest.fn();
	const { container } = render(
		<NavItem
			icon={<span data-testid="own-icon" />}
			label="Logs"
			badge={<span data-testid="badge" />}
			chevron
			onPress={onPress}
			testID="item"
		/>
	);
	expect(screen.getByTestId('own-icon')).toBeTruthy();
	expect(screen.getByTestId('badge')).toBeTruthy();
	expect(container.querySelector('[data-icon="chevronRight"]')).not.toBeNull();
	fireEvent.click(screen.getByTestId('item'));
	expect(onPress).toHaveBeenCalledTimes(1);
});

it('renders an element label as is and keeps selected beside a caller accessibility state', () => {
	render(
		<NavItem
			selected
			label={<span data-testid="styled-label">Reports</span>}
			accessibilityState={{ disabled: true }}
			testID="item"
		/>
	);
	expect(screen.getByTestId('item')).toContainElement(screen.getByTestId('styled-label'));
	expect(screen.getByTestId('item').getAttribute('aria-selected')).toBe('true');
	expect(JSON.parse(screen.getByTestId('item').dataset.state ?? '{}')).toEqual({
		disabled: true,
		selected: true,
	});
});
