import * as React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import MaskedViewClass from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { usePosterBandHeight } from './band.native';
import { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH, scrimStopsFor } from './scrim-stops';

export { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH };

type Stops = ReturnType<typeof scrimStopsFor>;

// masked-view 0.3.2 types its class as `Constructor<NativeMethods> & typeof Component`, which
// React 19's JSX check reads as a NativeMethods constructor, not a component; its props are these.
const MaskedView = MaskedViewClass as unknown as React.ComponentType<
	ViewProps & { maskElement: React.ReactElement }
>;

/** A top-down gradient filling its box: `color` at each stop's `of`, times `strength`. */
function Gradient({
	id,
	stops,
	color,
	strength,
}: {
	id: string;
	stops: Stops;
	color: string;
	strength: number;
}) {
	return (
		<Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
			<Defs>
				<LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
					{stops.map(({ offset, of }, index) => (
						<Stop key={index} offset={offset} stopColor={color} stopOpacity={of * strength} />
					))}
				</LinearGradient>
			</Defs>
			<Rect width="100%" height="100%" fill={`url(#${id})`} />
		</Svg>
	);
}

/**
 * The words' block with the card-colour fade behind it (native). The gradient is drawn at the
 * block's measured height, so the stops are fractions of it and the plateau starts exactly at
 * the words whatever the number of lines. Under the tint, `blur` (a blurred copy of the tile's
 * picture) shows through a mask of the same stops at full alpha, the native form of the web's
 * masked `backdrop-filter`. The copy is lined up with the square: the block spans the card's
 * width and is anchored to its foot, so the square is `width` tall and ends a band above the
 * block's bottom edge.
 */
export function Scrim({
	blur,
	children,
	...props
}: ViewProps & { className?: string; blur?: React.ReactNode }) {
	const card = String(useCSSVariable('--color-card') ?? '');
	const band = usePosterBandHeight();
	const [size, setSize] = React.useState({ width: 0, height: 0 });
	const id = `poster-scrim-${React.useId().replace(/:/g, '')}`;
	const stops = scrimStopsFor(size.height);
	return (
		<View
			{...props}
			onLayout={(event) => {
				const { width, height } = event.nativeEvent.layout;
				setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
			}}
		>
			{/* First, so the tint and the words paint above it. */}
			{blur != null && size.width > 0 && size.height > 0 && (
				<MaskedView
					pointerEvents="none"
					style={StyleSheet.absoluteFill}
					maskElement={<Gradient id={`${id}-mask`} stops={stops} color="#000" strength={1} />}
				>
					<View
						style={{
							position: 'absolute',
							left: 0,
							right: 0,
							bottom: band,
							height: size.width,
						}}
					>
						{blur}
					</View>
				</MaskedView>
			)}
			{size.height > 0 && <Gradient id={id} stops={stops} color={card} strength={SCRIM_STRENGTH} />}
			{children}
		</View>
	);
}
