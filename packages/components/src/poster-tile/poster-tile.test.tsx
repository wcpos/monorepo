import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Text } from '../text';
import {
	PosterPlaceholder,
	PosterTile,
	type PosterTileProps,
	SCRIM_REACH,
	SCRIM_STOPS,
	scrimStopsFor,
} from './index';

let mockPressed = false;
// Keep RNW's Pressable (press, ref); expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	const ReactActual = jest.requireActual('react');
	const View = ({
		className,
		testID,
		accessibilityLabel,
		style,
		children,
	}: {
		className?: string;
		testID?: string;
		accessibilityLabel?: string;
		style?: object;
		children?: React.ReactNode;
	}) =>
		ReactActual.createElement(
			'div',
			{
				'data-classes': className,
				'data-testid': testID,
				'aria-label': accessibilityLabel,
				'data-style': JSON.stringify(style ?? null),
			},
			children
		);
	return {
		...actual,
		View,
		Pressable: ReactActual.forwardRef(function Pressable(
			{ className, children, ...props }: { className?: string; children?: unknown },
			ref: React.Ref<unknown>
		) {
			// The pressed state is the test's to set: jsdom has no press gesture to hold.
			const render =
				typeof children === 'function'
					? (state: { pressed: boolean }) =>
							(children as (state: { pressed: boolean }) => React.ReactNode)({
								...state,
								pressed: state.pressed || mockPressed,
							})
					: children;
			return ReactActual.createElement(actual.Pressable, {
				...props,
				ref,
				children: render,
				dataSet: { classes: className },
			});
		}),
	};
});
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireMock('react-native').View },
}));
jest.mock('react-native-svg', () => {
	const ReactActual = jest.requireActual('react');
	const element =
		(name: string) =>
		({ children }: { children?: React.ReactNode }) =>
			ReactActual.createElement('i', { 'data-svg': name }, children);
	return {
		__esModule: true,
		default: element('svg'),
		Defs: element('defs'),
		LinearGradient: element('linear-gradient'),
		Rect: element('rect'),
		Stop: element('stop'),
	};
});
jest.mock('uniwind', () => ({ useCSSVariable: () => '#fff' }));
jest.mock('../text', () => ({
	Text: ({ className, children }: React.PropsWithChildren<{ className?: string }>) => {
		const { TextClassContext } = jest.requireActual('../text');
		const { cn } = jest.requireActual('../lib/utils');
		return <span data-classes={cn(React.useContext(TextClassContext), className)}>{children}</span>;
	},
}));
jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => {
		const { TextClassContext } = jest.requireActual('../text');
		const { cn } = jest.requireActual('../lib/utils');
		const inherited = React.useContext(TextClassContext);
		return <span data-icon={name} data-classes={cn(inherited, className)} />;
	},
}));
jest.mock('../image', () => ({
	Image: ({ source }: { source: { uri?: string } }) => <span data-image={source.uri} />,
}));

const IMAGE = { kind: 'image', source: { uri: 'tea.jpg' } } as const;

function tile(props: Partial<PosterTileProps> = {}) {
	return (
		<PosterTile
			picture={IMAGE}
			onPress={jest.fn()}
			accessibilityLabel="Tea"
			testID="tile"
			squareTestID="tile-12"
			{...props}
		/>
	);
}
const classes = (testID: string) => screen.getByTestId(testID).dataset.classes ?? '';

it('draws no scrim when every word slot is empty; the marks still show', () => {
	render(tile({ mark: { kind: 'count', value: 3 }, markTestID: 'stock', title: false }));
	expect(screen.queryByTestId('poster-scrim')).toBeNull();
	expect(screen.queryByTestId('poster-words')).toBeNull();
	expect(screen.getByTestId('stock').textContent).toBe('3');
});

it('draws the scrim over a picture, with the words in order', () => {
	render(tile({ title: 'Tea', money: '4.00', sub: '6 options', facts: 'SKU T1' }));
	expect(screen.getByTestId('poster-scrim').textContent).toBe('Tea4.006 optionsSKU T1');
	expect(screen.getByTestId('tile-12').querySelector('[data-image="tea.jpg"]')).not.toBeNull();
});

it('blurs the picture under the words on web, masked by the same fade, and not on a tint', () => {
	const { rerender } = render(tile({ title: 'Tea' }));
	const blur = JSON.parse(screen.getByTestId('poster-scrim-blur').dataset.style!);
	expect(blur.backdropFilter).toBe('blur(6px)');
	// Every stop, at its position: the same thirteen as the tint, as alpha.
	expect(blur.maskImage).toBe(
		`linear-gradient(to bottom, ${[
			...SCRIM_STOPS.map(([at, of]) => `rgb(0 0 0 / ${of}) ${at * SCRIM_REACH}px`),
			'#000 100%',
		].join(', ')})`
	);
	rerender(tile({ picture: { kind: 'tint', tint: 1 }, title: 'Tea' }));
	expect(screen.queryByTestId('poster-scrim-blur')).toBeNull();
});

it('never mounts the blurred twin on web: backdrop-filter already blurs the picture', () => {
	const { container, rerender } = render(
		tile({
			picture: {
				kind: 'slot',
				children: <span data-testid="sharp" />,
				blurred: <span data-testid="twin" />,
			},
			title: 'Tea',
		})
	);
	expect(screen.getByTestId('sharp')).toBeTruthy();
	expect(screen.queryByTestId('twin')).toBeNull();
	expect(screen.getByTestId('poster-scrim-blur')).toBeTruthy();
	// The twin the tile builds for an image is not mounted either: one picture, the sharp one.
	rerender(tile({ title: 'Tea' }));
	expect(container.querySelectorAll('[data-image="tea.jpg"]')).toHaveLength(1);
});

it('gives native one list of scrim stops: thirteen and the plateau, clamped to the block', () => {
	const tall = scrimStopsFor(SCRIM_REACH * 2);
	expect(tall).toHaveLength(14);
	// The fade ends halfway down a block twice the reach; the plateau is the bottom edge.
	expect(tall[12]).toEqual({ offset: 0.5, of: 1 });
	expect(tall[13]).toEqual({ offset: 1, of: 1 });
	expect(scrimStopsFor(SCRIM_REACH)[13]).toEqual({ offset: 1, of: 1 });
	// A block shorter than the reach: the fade's tail is clamped to its foot, never past it.
	const short = scrimStopsFor(SCRIM_REACH / 2);
	expect(short).toHaveLength(14);
	expect(short.every(({ offset }) => offset >= 0 && offset <= 1)).toBe(true);
	expect(short[12].offset).toBe(1);
	expect(short.map(({ of }) => of)).toEqual([...SCRIM_STOPS.map(([, of]) => of), 1]);
	expect(scrimStopsFor(0)).toEqual([]);
});

it('puts the words straight on a tint, with the tint’s class and no scrim', () => {
	render(tile({ picture: { kind: 'tint', tint: 4 }, title: 'Tea' }));
	expect(screen.queryByTestId('poster-scrim')).toBeNull();
	expect(screen.getByTestId('poster-words').textContent).toBe('Tea');
	// The whole card is the tint: the square and the band under it.
	expect(classes('poster-card')).toContain('bg-tile-tint-4');
});

it('puts words directly on an accent fill without a scrim', () => {
	render(tile({ picture: { kind: 'fill' }, title: 'All products' }));
	expect(classes('poster-card')).toContain('bg-primary border-transparent');
	expect(screen.queryByTestId('poster-scrim')).toBeNull();
	expect(screen.getByTestId('poster-words').textContent).toBe('All products');
});

it('greys the picture of a tile that is out', () => {
	const { rerender } = render(tile());
	expect(classes('poster-picture')).not.toContain('opacity-40');
	rerender(tile({ out: true }));
	expect(classes('poster-picture')).toContain('opacity-40');
});

it('draws two cards behind a stacked tile, and none otherwise', () => {
	const { rerender } = render(tile());
	expect(screen.queryByTestId('poster-stack')).toBeNull();
	rerender(tile({ stacked: true }));
	expect(screen.getByTestId('poster-stack').children).toHaveLength(2);
});

it('shows a stock count with its label, warning-coloured when low', () => {
	const { rerender } = render(
		tile({ mark: { kind: 'count', value: 3 }, markLabel: '3 left', markTestID: 'stock' })
	);
	expect(screen.getByTestId('stock').textContent).toBe('3');
	expect(screen.getByLabelText('3 left')).toBe(screen.getByTestId('stock'));
	expect(classes('stock')).not.toContain('bg-warning');
	rerender(
		tile({ mark: { kind: 'count', value: 3, low: true }, markLabel: '3 left', markTestID: 'stock' })
	);
	expect(classes('stock')).toContain('bg-warning');
});

it('shows the way back on the tile in slot 0', () => {
	render(tile({ back: true, backTestID: 'back' }));
	expect(screen.getByTestId('back').querySelector('[data-icon="chevronLeft"]')).not.toBeNull();
});

it('presses, and forwards its ref to the pressable for the Deal to measure', () => {
	const onPress = jest.fn();
	const ref = React.createRef<React.ComponentRef<typeof PosterTile>>();
	render(
		<PosterTile
			ref={ref}
			picture={IMAGE}
			onPress={onPress}
			accessibilityLabel="Tea"
			testID="tile"
		/>
	);
	fireEvent.click(screen.getByTestId('tile'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(ref.current).not.toBeNull();
});

it('steps aside when lifted, and grows or shares the row', () => {
	const { rerender } = render(tile());
	expect(screen.getByTestId('tile').style.opacity).toBe('');
	expect(classes('tile').split(' ')).toContain('flex-1');
	rerender(tile({ lifted: true, grow: true }));
	expect(screen.getByTestId('tile').style.opacity).toBe('0');
	expect(classes('tile').split(' ')).toContain('grow');
	expect(classes('tile').split(' ')).not.toContain('flex-1');
});

it('keeps the name when the words outgrow the square: the block clips at its foot', () => {
	const facts = <span data-testid="facts">{'SKU '.repeat(80)}</span>;
	render(tile({ title: 'Tea', facts }));
	const words = classes('poster-scrim').split(' ');
	expect(words).toEqual(expect.arrayContaining(['bottom-0', 'max-h-full', 'overflow-hidden']));
	// The name comes first in the block, so a clip at the foot takes the facts, not the name.
	const block = screen.getByTestId('poster-scrim');
	// (The web scrim's blur layer comes first, under the words; it holds no words.)
	const blur = screen.getByTestId('poster-scrim-blur');
	expect(block.firstChild).toBe(blur);
	expect(blur.nextSibling?.textContent).toBe('Tea');
	expect(block.lastChild).toBe(screen.getByTestId('facts'));
});

it('veils a tint as it veils a picture while pressed, and only then', () => {
	const { rerender } = render(tile({ picture: { kind: 'tint', tint: 2 }, title: 'Tea' }));
	expect(screen.queryByTestId('poster-pressed')).toBeNull();
	mockPressed = true;
	rerender(tile({ picture: { kind: 'tint', tint: 2 }, title: 'Tea' }));
	expect(classes('poster-pressed')).toContain('bg-foreground/10');
	rerender(tile({ title: 'Tea' }));
	expect(classes('poster-pressed')).toContain('bg-foreground/10');
	mockPressed = false;
	rerender(tile({ title: 'Tea' }));
	expect(screen.queryByTestId('poster-pressed')).toBeNull();
});

it('puts a band of the card under the square: card colour over a picture, the tint on a tint', () => {
	const { rerender } = render(tile({ title: 'Tea' }));
	const card = screen.getByTestId('poster-card');
	// Square, then band, both inside the one bordered card.
	expect(card.children[0]).toBe(screen.getByTestId('tile-12'));
	expect(card.children[1]).toBe(screen.getByTestId('poster-band'));
	expect(classes('poster-band')).toMatch(/^h-\[calc\(var\(--text-base\)/);
	expect(classes('poster-card')).toContain('bg-card');
	expect(classes('poster-card')).toContain('border-border');
	// The card keeps the tile radius; the media radius clips the picture square alone, so a circle on
	// Paper till never clips the words or the corner marks (Codex on #3139).
	expect(classes('poster-card')).toContain('rounded-tile');
	expect(classes('poster-card')).not.toContain('rounded-media');
	expect(classes('tile-12')).toContain('rounded-media');
	expect(classes('tile-12')).not.toContain('border');
	rerender(tile({ picture: { kind: 'tint', tint: 3 }, title: 'Tea' }));
	expect(classes('poster-card')).toContain('bg-tile-tint-3');
	expect(screen.getByTestId('poster-band')).toBeTruthy();
});

it('anchors the words to the card, not the square, so the money row sits on the band', () => {
	render(tile({ title: 'Tea', money: '4.00' }));
	const words = screen.getByTestId('poster-scrim');
	expect(words.parentElement).toBe(screen.getByTestId('poster-card'));
	expect(screen.getByTestId('tile-12').contains(words)).toBe(false);
	expect(classes('poster-scrim').split(' ')).toContain('bottom-0');
});

it('paints the marks after the words, so a fade that climbs far never washes over them', () => {
	render(
		tile({
			title: 'Tea',
			facts: 'SKU T1',
			mark: { kind: 'count', value: 3 },
			markTestID: 'stock',
			corner: <span data-testid="in-cart" />,
		})
	);
	const card = [...screen.getByTestId('poster-card').children];
	const at = (node: Element) => card.findIndex((child) => child === node || child.contains(node));
	const scrim = at(screen.getByTestId('poster-scrim'));
	expect(at(screen.getByTestId('stock'))).toBeGreaterThan(scrim);
	expect(at(screen.getByTestId('in-cart'))).toBeGreaterThan(scrim);
	// Still at the card's top corners, outside the square that the words climb.
	expect(screen.getByTestId('tile-12').contains(screen.getByTestId('stock'))).toBe(false);
});

it("holds a slot in the tile's own shape: square and band", () => {
	render(<PosterPlaceholder testID="placeholder" />);
	const placeholder = screen.getByTestId('placeholder');
	expect(placeholder.children).toHaveLength(2);
	expect(placeholder.children[1].getAttribute('data-classes')).toContain(
		'h-[calc(var(--text-base)'
	);
});

// Without the tile provider, arbitrary word slots miss the fill's ink.
it('one ink: filled words and the bare mark inherit primary foreground', () => {
	const { container } = render(
		tile({
			picture: { kind: 'fill' },
			title: <Text>All</Text>,
			sub: <Text>Products</Text>,
			mark: { kind: 'folder' },
		})
	);
	const nodes = container.querySelectorAll('span[data-classes]');
	expect(nodes).toHaveLength(3);
	for (const node of nodes)
		expect(node.getAttribute('data-classes')).toBe('text-primary-foreground');
});
it.each([false, true])('one ink: stock count and glyph agree (low=%s)', (low) => {
	const { container } = render(tile({ mark: { kind: 'count', value: 3, low } }));
	const nodes = container.querySelectorAll('span[data-classes]');
	expect(nodes).toHaveLength(2);
	for (const node of nodes)
		expect(node.getAttribute('data-classes')).toContain(
			low ? 'text-warning-foreground' : 'text-foreground'
		);
});
