import { readFileSync } from 'node:fs';

import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Chip } from './index';

// Keep RNW press/focus behavior; expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const presses = new Map();
	const slops = new Map();
	const layouts = new Map();
	return {
		...actual,
		presses,
		slops,
		layouts,
		View: ({ testID, ...props }: { testID?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID }),
		Pressable: ({
			className,
			...props
		}: import('react-native').PressableProps & {
			ref?: React.Ref<import('react-native').View>;
		}) => {
			presses.set(props.testID, props.onPress);
			slops.set(props.testID, props.hitSlop);
			layouts.set(props.testID, props.onLayout);
			return React.createElement(actual.Pressable, { ...props, dataSet: { classes: className } });
		},
		Text: ({ className, ...props }: import('react-native').TextProps) =>
			React.createElement(actual.Text, { ...props, dataSet: { classes: className } }),
	};
});
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
// The measure itself is `lib/min-target`'s test; here, which Pressable gets the grown target.
jest.mock('../lib/min-target', () => ({
	useMinTargetSlop: (enabled: boolean) => ({
		hitSlop: enabled ? { top: 6, bottom: 6 } : undefined,
		onLayout: undefined,
	}),
}));
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
it('gives a sm chip the 44 pt target on its root, which presses as the label when clearable', () => {
	const { slops, presses, layouts } = jest.requireMock<{
		slops: Map<string, unknown>;
		presses: Map<string, unknown>;
		layouts: Map<string, unknown>;
	}>('react-native');
	const onPress = jest.fn();
	const { rerender } = render(<Chip label="Menu" testID="chip" size="sm" onPress={onPress} />);
	expect(slops.get('chip')).toEqual({ top: 6, bottom: 6 });
	expect(presses.get('chip')).toBe(onPress);
	// `hitSlop` never reaches past a parent, so the band is the root's even with a clear control.
	rerender(<Chip label="Menu" testID="chip" size="sm" onPress={onPress} onClear={() => {}} />);
	expect(slops.get('chip')).toEqual({ top: 6, bottom: 6 });
	expect(slops.get('chip-label')).toBeUndefined();
	// The band above and below routes by where it landed: past the clear half's x it clears.
	const onClear = jest.fn();
	rerender(<Chip label="Menu" testID="chip" size="sm" onPress={onPress} onClear={onClear} />);
	const route = presses.get('chip') as (event: object) => void;
	const layoutClear = layouts.get('chip-clear') as (event: object) => void;
	layoutClear({ nativeEvent: { layout: { x: 50, width: 32 } } });
	route({ nativeEvent: { locationX: 10 } });
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(onClear).not.toHaveBeenCalled();
	route({ nativeEvent: { locationX: 60 } });
	expect(onClear).toHaveBeenCalledTimes(1);
	expect(onPress).toHaveBeenCalledTimes(1);
	// Right to left the clear half comes first: its span, not its side, decides.
	layoutClear({ nativeEvent: { layout: { x: 0, width: 32 } } });
	route({ nativeEvent: { locationX: 60 } });
	expect(onPress).toHaveBeenCalledTimes(2);
	route({ nativeEvent: { locationX: 10 } });
	expect(onClear).toHaveBeenCalledTimes(2);
	// Without the grown target a clearable root still takes no press.
	rerender(<Chip label="Menu" testID="chip" onPress={onPress} onClear={() => {}} />);
	expect(slops.get('chip')).toBeUndefined();
	expect(presses.get('chip')).toBeUndefined();
});
it.each([
	[undefined, 'h-ctl', 'text-base'],
	['sm' as const, 'h-8', 'text-sm'],
])('size %s sets the height and label size, keeping the on-state', (size, height, text) => {
	render(<Chip label="Menu" testID="chip" size={size} on />);
	const root = screen.getByTestId('chip').dataset.classes?.split(' ') ?? [];
	expect(root).toEqual(expect.arrayContaining([height, 'rounded-full', 'border-primary']));
	const label = screen.getByTestId('chip-label').dataset.classes?.split(' ') ?? [];
	expect(label).toEqual(expect.arrayContaining([text, 'text-primary', 'font-semibold']));
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
	it('routes a press in the sm band over the action cell to the action on native', () => {
		const { presses, layouts } = jest.requireMock<{
			presses: Map<string, unknown>;
			layouts: Map<string, unknown>;
		}>('react-native');
		const onPress = jest.fn();
		const onAction = jest.fn();
		render(
			<Chip label="Ada" testID="chip" size="sm" onPress={onPress} action={action(onAction)} />
		);
		(layouts.get('chip-address') as (event: object) => void)({
			nativeEvent: { layout: { x: 50, width: 32 } },
		});
		const route = presses.get('chip') as (event: object) => void;
		route({ nativeEvent: { locationX: 60 } });
		expect(onAction).toHaveBeenCalledTimes(1);
		route({ nativeEvent: { locationX: 10 } });
		expect(onPress).toHaveBeenCalledTimes(1);
		expect(onAction).toHaveBeenCalledTimes(1);
	});
	it('fills each cell on its own, never the pill (read from source)', () => {
		const source = readFileSync(`${__dirname}/index.tsx`, 'utf8');
		expect(source).toContain("action ? 'gap-0 px-0' : 'active:bg-muted web:hover:bg-muted'");
		expect(source).toContain(
			"'border-border active:bg-muted web:hover:bg-muted rounded-r-full border-l'"
		);
	});
});
