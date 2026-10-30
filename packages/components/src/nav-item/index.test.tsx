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
				dataSet: { classes: className },
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
	['drawer', 'h-12 rounded-lg', 'text-selected-foreground', 'text-sidebar-foreground'],
] as const)('paints the %s size and its selected surface', (size, shape, on, off) => {
	const { container, unmount } = render(
		<NavItem size={size} selected icon="settings" label="General" testID="item" />
	);
	expect(classes('item')).toContain(shape);
	expect(classes('item').split(' ')).toContain(size === 'drawer' ? 'bg-selected' : 'bg-card');
	if (size === 'drawer') {
		expect(classes('item')).toContain('active:bg-selected');
		expect(classes('item')).toContain('web:hover:bg-selected');
	}
	expect(classes('item-label')).toContain(on);
	expect(icon(container, 'settings')).toContain(on);
	expect(screen.getByTestId('item').getAttribute('aria-selected')).toBe('true');
	unmount();

	const rest = render(<NavItem size={size} icon="settings" label="General" testID="item" />);
	expect(classes('item').split(' ')).not.toContain('bg-card');
	expect(classes('item')).toContain('active:bg-card');
	expect(classes('item-label')).toContain(off);
	expect(icon(rest.container, 'settings')).toContain(off);
});

it('carries no retired left border or primary/10 wash', () => {
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

it('renders an element label as is', () => {
	render(
		<NavItem selected label={<span data-testid="styled-label">Reports</span>} testID="item" />
	);
	expect(screen.getByTestId('item')).toContainElement(screen.getByTestId('styled-label'));
});
