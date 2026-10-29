import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { Chip } from './index';

// Keep RNW press/focus behavior; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const presses = new Map();
	const longPresses = new Map();
	return {
		...actual,
		presses,
		longPresses,
		View: ({ testID, ...props }: { testID?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID }),
		Pressable: ({
			className,
			...props
		}: import('react-native').PressableProps & {
			ref?: React.Ref<import('react-native').View>;
		}) => {
			presses.set(props.testID, props.onPress);
			longPresses.set(props.testID, props.onLongPress);
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
	[{ on: true }, 'bg-selected border-selected', 'text-selected-foreground font-semibold'],
	[{ dimmed: true }, 'opacity-45', 'text-foreground'],
	[{ add: true }, 'border-dashed', 'text-muted-foreground'],
])('renders chip state %j', (state, root, label) => {
	render(<Chip label="Morning menu" testID="chip" {...state} />);
	expect(screen.getByTestId('chip').dataset.classes).toContain(root);
	expect(screen.getByTestId('chip-label').dataset.classes).toContain(label);
	expect(screen.getByTestId('chip-label').dataset.classes).not.toMatch(/truncate|text-sm/);
});
it('gives each press target of a sm chip the 44 pt band, and a split root no press', () => {
	const { presses } = jest.requireMock<{ presses: Map<string, unknown> }>('react-native');
	const onPress = jest.fn();
	const { rerender } = render(<Chip label="Menu" testID="chip" size="sm" onPress={onPress} />);
	expect(screen.getByTestId('chip').contains(screen.getByTestId('min-target-band'))).toBe(true);
	expect(presses.get('chip')).toBe(onPress);
	rerender(<Chip label="Menu" testID="chip" size="sm" onPress={onPress} onClear={() => {}} />);
	for (const half of ['chip-label', 'chip-clear'])
		expect(within(screen.getByTestId(half)).getByTestId('min-target-band')).toBeTruthy();
	expect(presses.get('chip')).toBeUndefined();
	rerender(<Chip label="Menu" testID="chip" onPress={onPress} />);
	expect(screen.queryByTestId('min-target-band')).toBeNull();
});
it.each([
	[undefined, 'h-ctl', 'text-base'],
	['sm' as const, 'h-8', 'text-sm'],
])('size %s sets the height and label size, keeping the on-state', (size, height, text) => {
	render(<Chip label="Menu" testID="chip" size={size} on />);
	const root = screen.getByTestId('chip').dataset.classes?.split(' ') ?? [];
	expect(root).toEqual(
		expect.arrayContaining([
			height,
			'rounded-full',
			'bg-selected',
			'border-selected',
			'active:bg-selected',
			'web:hover:bg-selected',
		])
	);
	const label = screen.getByTestId('chip-label').dataset.classes?.split(' ') ?? [];
	expect(label).toEqual(
		expect.arrayContaining([text, 'text-selected-foreground', 'font-semibold'])
	);
});
it('announces the on-state on the press target, with or without a clear control', () => {
	// Web: a button's toggle state is aria-pressed (aria-selected is not allowed on role=button).
	const { rerender } = render(<Chip label="Menu" testID="chip" on />);
	expect(screen.getByTestId('chip')).toHaveAttribute('aria-pressed', 'true');
	expect(screen.getByTestId('chip')).not.toHaveAttribute('aria-selected');
	rerender(<Chip label="Menu" testID="chip" on onClear={jest.fn()} />);
	expect(screen.getByTestId('chip-label')).toHaveAttribute('aria-pressed', 'true');
	expect(screen.getByTestId('chip')).not.toHaveAttribute('aria-pressed');
	rerender(<Chip label="Menu" testID="chip" on={false} />);
	expect(screen.getByTestId('chip')).toHaveAttribute('aria-pressed', 'false');
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
it('clear keeps its pointerdown off a trigger listening on the chip root', () => {
	// A web Select trigger (`asChild`) puts this on the chip root and opens its menu from a mouse
	// pointerdown; stopping the press alone never reached it.
	const onPointerDown = jest.fn();
	const trigger = { onPointerDown } as object;
	render(<Chip label="Menu" testID="chip" onClear={jest.fn()} {...trigger} />);
	fireEvent.pointerDown(screen.getByTestId('chip-clear'));
	expect(onPointerDown).not.toHaveBeenCalled();
	// The label still reaches the trigger, so the pill opens its menu.
	fireEvent.pointerDown(screen.getByTestId('chip-label'));
	expect(onPointerDown).toHaveBeenCalledTimes(1);
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

it('keeps the split wrapper out of the tree, floors the clear target and forwards a boolean disabled', () => {
	// Per class and per prop, read from source: react-native-web compiles these classes away
	// in this harness. Codex review on #2189.
	const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
	expect(source).toContain('accessible={trail ? false : undefined}');
	expect(source).toContain('!!(disabled || dimmed)');
	// The clear control is as wide as the chip is tall, at both sizes.
	expect(source).toContain("sm ? '-mr-2.5 min-w-8' : 'min-w-ctl -mr-3'");
	// The pill's own class line, found by a class only it carries.
	const root = source.match(/'([^']*rounded-full border[^']*)'/)?.[1]?.split(' ') ?? [];
	expect(root).toContain('self-start');
});

describe('action', () => {
	const action = (onPress = jest.fn(), more: object = {}) => ({
		icon: 'address' as const,
		onPress,
		accessibilityLabel: 'Edit address',
		testID: 'chip-address',
		...more,
	});
	it('renders an icon-only cell with its own name and testID, defaulting the testID', () => {
		const { container, rerender } = render(<Chip label="Ada" testID="chip" action={action()} />);
		expect(screen.getByTestId('chip-address')).toHaveAccessibleName('Edit address');
		expect(screen.getByTestId('chip-address')).toHaveAttribute('role', 'button');
		expect(container.querySelector('[data-icon="address"]')).not.toBeNull();
		expect(screen.getByTestId('chip')).toHaveAttribute('tabindex', '-1');
		rerender(<Chip label="Ada" testID="chip" action={action(jest.fn(), { testID: undefined })} />);
		expect(screen.getByTestId('chip-action')).toHaveAccessibleName('Edit address');
	});
	it('presses the action and not the label, and the label and not the action', () => {
		const onPress = jest.fn();
		const onAction = jest.fn();
		const outer = jest.fn();
		render(
			<div onClick={outer}>
				<Chip label="Ada" testID="chip" onPress={onPress} action={action(onAction)} />
			</div>
		);
		fireEvent.click(screen.getByTestId('chip-address'));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onPress).not.toHaveBeenCalled();
		expect(outer).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('chip-label'));
		expect(onPress).toHaveBeenCalledTimes(1);
		expect(onAction).toHaveBeenCalledTimes(1);
	});
	it('keeps its pointerdown off a trigger listening on the chip root', () => {
		const onPointerDown = jest.fn();
		render(<Chip label="Ada" testID="chip" action={action()} {...({ onPointerDown } as object)} />);
		fireEvent.pointerDown(screen.getByTestId('chip-address'));
		expect(onPointerDown).not.toHaveBeenCalled();
	});
	it.each([{ dimmed: true }, { disabled: true }])('is disabled with the chip for %j', (state) => {
		const onAction = jest.fn();
		render(<Chip {...state} label="Ada" testID="chip" action={action(onAction)} />);
		expect(screen.getByTestId('chip-address')).toHaveAttribute('aria-disabled', 'true');
		fireEvent.click(screen.getByTestId('chip-address'));
		expect(onAction).not.toHaveBeenCalled();
	});
	it('takes the clear control’s place: onClear is ignored when both are given', () => {
		render(<Chip label="Ada" testID="chip" onClear={jest.fn()} action={action()} />);
		expect(screen.queryByTestId('chip-clear')).toBeNull();
		expect(screen.getByTestId('chip-address')).toBeTruthy();
	});
	it('fills each cell on its own, never the pill (read from source)', () => {
		const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).toContain("action ? 'gap-0 px-0' : 'active:bg-muted web:hover:bg-muted'");
		expect(source).toContain(
			"'border-border active:bg-muted web:hover:bg-muted rounded-r-full border-l'"
		);
	});
});

it('delivers long press to the label half of a clearable chip', () => {
	const onLongPress = jest.fn();
	render(<Chip label="Menu" testID="chip" onClear={jest.fn()} onLongPress={onLongPress} />);
	expect(jest.requireMock('react-native').longPresses.get('chip-label')).toBe(onLongPress);
});
it.each([false, true])(
	'right-click opens once and prevents the browser menu (split=%s)',
	(split) => {
		const onLongPress = jest.fn();
		const onPress = jest.fn();
		render(
			<Chip
				label="Menu"
				testID="chip"
				onPress={onPress}
				onClear={split ? jest.fn() : undefined}
				onLongPress={onLongPress}
			/>
		);
		expect(fireEvent.contextMenu(screen.getByTestId(split ? 'chip-label' : 'chip'))).toBe(false);
		expect(onLongPress).toHaveBeenCalledTimes(1);
		expect(onPress).not.toHaveBeenCalled();
	}
);
