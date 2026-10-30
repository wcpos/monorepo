import * as React from 'react';
import { Pressable, StyleSheet, View, type ViewInstance } from 'react-native';

import Animated from 'react-native-reanimated';

import { Icon, type IconName } from '../icon';
import { Image } from '../image';
import { Mark } from './mark';
import { StockPill } from './stock-pill';
import { CARD, CIRCLE, FAR, NEAR, TINTS } from './style';
import { PosterBand } from './band';
import { Scrim } from './scrim';
import { POSTER_BAND, SCRIM_BLUR_RADIUS, SCRIM_REACH } from './scrim-stops';
import { type Tint, tintOf } from './tint-of';

import type { ImageSource } from 'expo-image';

export { POSTER_BAND, PosterBand, StockPill, tintOf, type Tint };
export { PosterThumb, type PosterThumbProps } from './thumb';
export {
	SCRIM_BLUR_RADIUS,
	SCRIM_REACH,
	SCRIM_STOPS,
	SCRIM_STRENGTH,
	scrimStopsFor,
} from './scrim-stops';

export type PosterPicture =
	| {
			kind: 'image';
			source: ImageSource;
			/** Already on screen and only changing place: no fade in. */
			still?: boolean;
			recyclingKey?: string;
			onDisplay?: () => void;
			onError?: () => void;
	  }
	/** The caller renders the picture itself (a product's attachment handling, its probes). */
	| {
			kind: 'slot';
			children: React.ReactNode;
			/**
			 * The same picture, blurred (`blurRadius={SCRIM_BLUR_RADIUS}`), for the native scrim's
			 * frosted fade; web never mounts it. Without one, native draws the tint alone.
			 */
			blurred?: React.ReactNode;
	  }
	/** The accent fill, for the one tile that is the root of the grid. */
	| { kind: 'fill' }
	| { kind: 'tint'; tint: Tint }
	| { kind: 'mosaic'; sources: ImageSource[] };

export type PosterMark =
	| { kind: 'count'; value: number; low?: boolean }
	| { kind: 'backorder' }
	| { kind: 'folder' }
	/** A tile that is not a category or a product (All products, a shortcut) keeps its glyph. */
	| { kind: 'glyph'; name: IconName };

export type PosterTileProps = {
	picture: PosterPicture;
	/** Top-left. */
	mark?: PosterMark;
	/** The mark's accessibility label, and the backorder pill's word. */
	markLabel?: string;
	markTestID?: string;
	/** Top-right: the in-cart count, mounted by the caller. */
	corner?: React.ReactNode;
	/** The tile in slot 0 of a dealt grid: tapping it is the way back. */
	back?: boolean;
	backTestID?: string;
	/** Words on the scrim, in this order. Every slot empty: no scrim. */
	title?: React.ReactNode;
	money?: React.ReactNode;
	sub?: React.ReactNode;
	facts?: React.ReactNode;
	/** Greys the picture; the caller says "Sold out" in the money slot. */
	out?: boolean;
	/** The stack of cards behind the tile: any tile that deals more tiles out ("tap to deal"). */
	stacked?: boolean;
	/** The stack's style, for the Deal's fade (an animated style). */
	stackStyle?: React.ComponentProps<typeof Animated.View>['style'];
	/** Grows to its row (a dealt cell) rather than taking a share of it. */
	grow?: boolean;
	/** The Deal has its copy out on the stage. */
	lifted?: boolean;
	/** The frame's own layout: the Deal re-measures a lifted tile when it reflows. */
	onLayout?: React.ComponentProps<typeof Pressable>['onLayout'];
	onPress: () => void;
	accessibilityLabel: string;
	testID: string;
	squareTestID?: string;
	children?: never;
};

const VEIL = 'bg-foreground/10 absolute inset-0';
// The words' block, at the foot of the card. Never taller than the card: on a narrow tile
// what overflows is clipped at the bottom (the facts), so the name, money and sub stay.
const WORDS = 'absolute right-0 bottom-0 left-0 max-h-full gap-0.5 overflow-hidden';
// The words sit the scrim's reach below its top edge, where the fade has reached full strength.
const REACH = { paddingTop: SCRIM_REACH };
// A tile the Deal has lifted off the grid: its copy is out on the stage.
const LIFTED = { opacity: 0 };
// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };
// The native scrim's blurred copy of the picture: blurred at decode, and never fading in on its own.
const BLURRED = { blurRadius: SCRIM_BLUR_RADIUS, transition: 0 };

function hasWords(...slots: React.ReactNode[]) {
	return slots.some((slot) => slot != null && slot !== false && slot !== '');
}

// Up to four pictures in columns: one fills, two halve, three put one beside two, four quarter.
const MOSAIC: number[][][] = [
	[],
	[[0]],
	[[0], [1]],
	[[0], [1, 2]],
	[
		[0, 2],
		[1, 3],
	],
];

function Mosaic({ sources, blurred }: { sources: ImageSource[]; blurred?: boolean }) {
	const four = sources.slice(0, 4);
	return (
		<View className="bg-border h-full w-full flex-row gap-0.5">
			{MOSAIC[four.length].map((column, index) => (
				<View key={index} className="flex-1 gap-0.5">
					{column.map((at) => (
						<Image
							key={at}
							source={four[at]}
							contentFit="cover"
							className="w-full flex-1"
							{...(blurred ? BLURRED : {})}
						/>
					))}
				</View>
			))}
		</View>
	);
}

function Picture({ picture }: { picture: PosterPicture }) {
	switch (picture.kind) {
		case 'image':
			return (
				<Image
					source={picture.source}
					recyclingKey={picture.recyclingKey}
					contentFit="cover"
					className="h-full w-full"
					onDisplay={picture.onDisplay}
					onError={picture.onError}
					{...(picture.still ? STILL : {})}
				/>
			);
		case 'slot':
			return <>{picture.children}</>;
		case 'mosaic':
			return <Mosaic sources={picture.sources} />;
		default:
			return null;
	}
}

/** Whether the picture has a blurred twin for the native scrim: a tint has nothing to blur. */
function hasTwin(picture: PosterPicture) {
	return picture.kind === 'slot'
		? picture.blurred != null
		: picture.kind !== 'tint' && picture.kind !== 'fill';
}

/** The picture's blurred twin: the slot owner's, or the same image or mosaic built blurred. */
function BlurredPicture({ picture }: { picture: PosterPicture }) {
	switch (picture.kind) {
		case 'image':
			return (
				<Image
					source={picture.source}
					recyclingKey={picture.recyclingKey && `${picture.recyclingKey}:blur`}
					contentFit="cover"
					className="h-full w-full"
					{...BLURRED}
				/>
			);
		case 'slot':
			return <>{picture.blurred}</>;
		case 'mosaic':
			return <Mosaic sources={picture.sources} blurred />;
		default:
			return null;
	}
}

/**
 * The register's product grid tile: the picture is the whole square and the words sit on a
 * card-colour scrim at its foot (wcpos/roadmap `docs/specs/2026-10-12-pos-product-tile-poster-spec.md`).
 * It knows nothing about products: a picture, marks and words. The frame keeps `m-1` and forwards
 * its ref, so the Deal measures and lifts it as before; a stack's cards are drawn inside that
 * frame, behind the card.
 */
export const PosterTile = React.forwardRef<ViewInstance, PosterTileProps>(function PosterTile(
	{
		picture,
		mark,
		markLabel,
		markTestID,
		corner,
		back,
		backTestID,
		title,
		money,
		sub,
		facts,
		out,
		stacked,
		stackStyle,
		grow,
		lifted,
		onLayout,
		onPress,
		accessibilityLabel,
		testID,
		squareTestID,
	},
	ref
) {
	const tint = picture.kind === 'tint' ? picture.tint : null;
	const filled = picture.kind === 'fill';
	const words = hasWords(title, money, sub, facts) && (
		<>
			{title}
			{money}
			{sub}
			{facts}
		</>
	);
	return (
		<Pressable
			ref={ref}
			onLayout={onLayout}
			onPress={onPress}
			style={lifted ? LIFTED : undefined}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			className={`m-1 ${grow ? 'grow' : 'flex-1'} rounded-lg`}
			testID={testID}
		>
			{({ pressed }) => (
				<>
					{stacked && (
						<Animated.View
							pointerEvents="none"
							style={[StyleSheet.absoluteFill, stackStyle]}
							testID="poster-stack"
						>
							<View className={CARD} style={FAR} />
							<View className={CARD} style={NEAR} />
						</Animated.View>
					)}
					<View
						className={`overflow-hidden rounded-lg border ${
							filled
								? 'bg-primary border-transparent'
								: tint === null
									? 'bg-card border-border'
									: `${TINTS[tint]} border-transparent`
						}`}
						testID="poster-card"
					>
						<View className="aspect-square overflow-hidden" testID={squareTestID}>
							<View className={`h-full w-full ${out ? 'opacity-40' : ''}`} testID="poster-picture">
								<Picture picture={picture} />
							</View>
							{/* The press dims the picture or the tint alike, under the words and marks. */}
							{pressed && <View className={VEIL} pointerEvents="none" testID="poster-pressed" />}
						</View>
						<PosterBand testID="poster-band">
							{pressed && <View className={VEIL} pointerEvents="none" />}
						</PosterBand>
						{/* Anchored to the card: one line of name and the money row sit on the band, and the
						    fade begins at the picture's foot; more lines climb into it. */}
						{words &&
							(tint === null && !filled ? (
								<Scrim
									className={`${WORDS} px-2.5 pb-2.5`}
									// The reach is the scrim's top padding: one constant for both.
									style={REACH}
									testID="poster-scrim"
									// Native only: the square's own layers again, blurred, on the card (what web's
									// backdrop-filter sees), so an out tile and a press read the same through it.
									blur={
										hasTwin(picture) ? (
											<View className="bg-card h-full w-full">
												<View className={`h-full w-full ${out ? 'opacity-40' : ''}`}>
													<BlurredPicture picture={picture} />
												</View>
												{pressed && <View className={VEIL} />}
											</View>
										) : null
									}
								>
									{words}
								</Scrim>
							) : (
								<View className={`${WORDS} p-2.5`} testID="poster-words">
									{words}
								</View>
							))}
						{/* Last, so the fade and blur of words that climb far never wash over them. */}
						{mark && (
							<View className="absolute top-2 left-2">
								<Mark
									mark={mark}
									label={markLabel}
									testID={markTestID}
									bare={tint !== null || filled}
									className={filled ? 'text-primary-foreground' : undefined}
								/>
							</View>
						)}
						{back && (
							<View className={`${CIRCLE} absolute top-2 right-2`} testID={backTestID}>
								<Icon name="chevronLeft" size="sm" className="text-muted-foreground" />
							</View>
						)}
						{corner != null && <View className="absolute top-2 right-2">{corner}</View>}
					</View>
				</>
			)}
		</Pressable>
	);
});

/** A Poster tile that has not arrived yet: its slot held in the tile's own shape, square and band. */
export function PosterPlaceholder({ testID, grow }: { testID?: string; grow?: boolean }) {
	return (
		<View
			className={`bg-muted m-1 ${grow ? 'grow' : 'flex-1'} rounded-lg`}
			aria-busy
			testID={testID}
		>
			<View className="aspect-square" />
			<PosterBand />
		</View>
	);
}
