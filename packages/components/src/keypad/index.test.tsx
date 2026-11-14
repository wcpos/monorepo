import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { decimalRow, DIGIT_ROWS, Key, Keypad, type KeypadKey } from './index';

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
	Icon: ({ name, className }: { name: string; className?: string }) => {
		const { TextClassContext } = jest.requireActual('../text');
		const { cn } = jest.requireActual('../lib/utils');
		const inherited = React.useContext(TextClassContext);
		return <span data-icon={name} data-classes={cn(inherited, className)} />;
	},
}));

const rows: readonly (readonly KeypadKey[])[] = [
	DIGIT_ROWS[0],
	[
		{ name: '0', label: '0', span: 2 },
		{ name: 'backspace', icon: 'backspace', label: 'Borrar dígito' },
	],
];
const classes = (testID: string) => screen.getByTestId(testID).dataset.classes;

it('renders in reading order and every key emits only its name', () => {
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
	expect(screen.getByRole('button', { name: 'Borrar dígito' })).toBeInTheDocument();
});

it('one testID scheme: keypad-key-<name>, the keypad testID as its prefix, an explicit ID wins', () => {
	render(<Keypad rows={[[{ name: 'clear', label: 'C' }]]} onPress={jest.fn()} />);
	render(<Key name="decimal" label="," onPress={jest.fn()} />);
	render(<Key name="back" label="⌫" testID="custom-back" onPress={jest.fn()} />);
	expect(screen.getByTestId('keypad-key-clear')).toBeInTheDocument();
	expect(screen.getByTestId('keypad-key-decimal')).toBeInTheDocument();
	expect(screen.getByTestId('custom-back')).toBeInTheDocument();
});

it('is the one face: the grid and every keypad draw the flat key; a quick key', () => {
	render(<Keypad rows={rows} onPress={jest.fn()} testID="pad" />);
	expect(classes('pad-key-1')).toMatch(/bg-muted.*min-h-ctl.*rounded-lg/);
	expect(screen.getByText('1').dataset.classes).toContain('font-semibold text-xl');
	render(<Key name="f" label="5" onPress={jest.fn()} />);
	expect(classes('keypad-key-f')).toMatch(/bg-muted.*min-h-ctl.*rounded-lg/);
	expect(classes('keypad-key-f')).not.toContain('border');
	expect(screen.getByText('5').dataset.classes).toContain('font-semibold text-xl');
	render(<Key name="q" label="Discount" text="−10%" on={false} onPress={jest.fn()} />);
	render(<Key name="l" label="Discount" text="−5%" on onPress={jest.fn()} />);
	expect(classes('keypad-key-q')).toContain('border-border border bg-transparent');
	expect(classes('keypad-key-l')).toContain('bg-primary');
	expect(screen.getByTestId('keypad-key-l')).toHaveAttribute('aria-pressed', 'true');
});

it('a span is its flex; fit tile is h-tile, shrink lets rows give way to the control floor', () => {
	const { rerender } = render(<Keypad rows={rows} onPress={jest.fn()} testID="pad" />);
	expect(screen.getByTestId('pad-key-0')).toHaveStyle({ flexGrow: 2 });
	expect(classes('pad-key-1')).toContain('h-tile');
	expect(screen.getByTestId('pad-key-1').parentElement).not.toHaveClass('flex-1');
	rerender(<Keypad rows={rows} onPress={jest.fn()} testID="pad" fit="shrink" />);
	expect(classes('pad-key-1')).not.toMatch(/(?:^| )h-tile(?: |$)/);
	expect(screen.getByTestId('pad-key-1').parentElement).toHaveClass('flex-1');
});

it('disabled keys do not emit', () => {
	const onPress = jest.fn();
	render(<Keypad rows={[[{ name: '1', label: '1', disabled: true }]]} onPress={onPress} />);
	fireEvent.click(screen.getByTestId('keypad-key-1'));
	expect(onPress).not.toHaveBeenCalled();
});

it('without a separator there is no decimal key and 0 spans its cell', () => {
	expect(decimalRow(',', '⌫').map((key) => [key.name, key.span])).toEqual([
		['decimal', undefined],
		['0', 1],
		['backspace', undefined],
	]);
	expect(decimalRow(undefined, '⌫').map((key) => [key.name, key.span])).toEqual([
		['0', 2],
		['backspace', undefined],
	]);
});

it.each([
	[{ on: true, variant: 'bad' }, 'text-primary-foreground'],
	[{ on: false }, 'text-primary'],
	[{ variant: 'bad' }, 'text-bad'],
	[{ variant: 'primary' }, 'text-primary'],
] as const)('one ink: text and icon keys share %j', (state, ink) => {
	const { container } = render(
		<>
			<Key name="word" label="Word" {...state} />
			<Key name="glyph" label="Glyph" icon="plus" {...state} />
		</>
	);
	const nodes = Array.from(container.querySelectorAll('[data-classes]')).filter(
		(node) =>
			node.hasAttribute('data-icon') || /\btext-/.test(node.getAttribute('data-classes') ?? '')
	);
	expect(nodes).toHaveLength(2);
	for (const node of nodes) expect(node.getAttribute('data-classes')).toContain(ink);
});
