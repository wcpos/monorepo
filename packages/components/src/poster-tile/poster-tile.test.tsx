import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PosterTile, type PosterTileProps } from './index';

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
			{ className, ...props }: { className?: string },
			ref: React.Ref<unknown>
		) {
			return ReactActual.createElement(actual.Pressable, {
				...props,
				ref,
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
	Text: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
		<span data-classes={className}>{children}</span>
	),
}));
jest.mock('../icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
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

it('puts the words straight on a tint, with the tint’s class and no scrim', () => {
	render(tile({ picture: { kind: 'tint', tint: 4 }, title: 'Tea' }));
	expect(screen.queryByTestId('poster-scrim')).toBeNull();
	expect(screen.getByTestId('poster-words').textContent).toBe('Tea');
	expect(classes('tile-12')).toContain('bg-tile-tint-4');
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
