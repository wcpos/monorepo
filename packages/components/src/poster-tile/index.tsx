import * as React from 'react';
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	View,
	type ViewInstance,
	type ViewStyle,
} from 'react-native';

import Animated from 'react-native-reanimated';

import { Icon, type IconName } from '../icon';
import { Image } from '../image';
import { Text } from '../text';
import { Scrim } from './scrim';
import { type Tint, tintOf } from './tint-of';

import type { ImageSource } from 'expo-image';

export { tintOf, type Tint };
export { SCRIM_REACH, SCRIM_STOPS, SCRIM_STRENGTH } from './scrim-stops';

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
	| { kind: 'slot'; children: React.ReactNode }
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
	/** The stack of cards behind the tile: a variable product, "tap to deal". */
	stacked?: boolean;
	/** The stack's style, for the Deal's fade (an animated style). */
	stackStyle?: StyleProp<ViewStyle>;
	/** Grows to its row (a dealt cell) rather than taking a share of it. */
	grow?: boolean;
	/** The Deal has its copy out on the stage. */
	lifted?: boolean;
	onPress: () => void;
	accessibilityLabel: string;
	testID: string;
	squareTestID?: string;
	children?: never;
};

// Literal classes, so the stylesheet keeps them.
const TINTS = [
	'bg-tile-tint-0',
	'bg-tile-tint-1',
	'bg-tile-tint-2',
	'bg-tile-tint-3',
	'bg-tile-tint-4',
	'bg-tile-tint-5',
] as const;
// A tile the Deal has lifted off the grid: its copy is out on the stage.
const LIFTED = { opacity: 0 };
// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };
// The two cards under a stacked tile, inside the 8 px the two `m-1` margins leave between tiles.
const NEAR = { top: 3, left: 3, right: -3, bottom: -3 };
const FAR = { top: 6, left: 6, right: -6, bottom: -6, opacity: 0.6 };
const CARD = 'bg-card border-border absolute rounded-lg border';
const CIRCLE = 'bg-card border-border size-6 items-center justify-center rounded-full border';
const PILL = 'h-[22px] flex-row items-center gap-1 rounded-full px-[7px]';

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
		case 'mosaic': {
			const sources = picture.sources.slice(0, 4);
			return (
				<View className="bg-border h-full w-full flex-row gap-0.5">
					{MOSAIC[sources.length].map((column, index) => (
						<View key={index} className="flex-1 gap-0.5">
							{column.map((at) => (
								<Image key={at} source={sources[at]} contentFit="cover" className="w-full flex-1" />
							))}
						</View>
					))}
				</View>
			);
		}
		default:
			return null;
	}
}

function Mark({
	mark,
	label,
	testID,
	bare,
}: {
	mark: PosterMark;
	label?: string;
	testID?: string;
	/** On a tint a glyph sits in the tint itself, without its circle. */
	bare?: boolean;
}) {
	if (mark.kind === 'count') {
		const tone = mark.low ? 'text-warning-foreground' : 'text-foreground';
		return (
			<View
				className={`${PILL} ${mark.low ? 'bg-warning' : 'bg-card border-border border'}`}
				accessibilityLabel={label}
				testID={testID}
			>
				<Icon name="box" size="xs" className={tone} />
				<Text className={`text-xs font-bold tabular-nums ${tone}`}>{mark.value}</Text>
			</View>
		);
	}
	if (mark.kind === 'backorder') {
		return (
			<View
				className={`${PILL} bg-card border-border border`}
				accessibilityLabel={label}
				testID={testID}
			>
				<Icon name="clock" size="xs" className="text-muted-foreground" />
				<Text className="text-muted-foreground text-xs font-bold">{label}</Text>
			</View>
		);
	}
	return (
		<View className={bare ? undefined : CIRCLE} accessibilityLabel={label} testID={testID}>
			<Icon
				name={mark.kind === 'folder' ? 'folder' : mark.name}
				size={bare ? 'lg' : 'sm'}
				className="text-muted-foreground"
			/>
		</View>
	);
}

/**
 * The register's product grid tile: the picture is the whole square and the words sit on a
 * card-colour scrim at its foot (wcpos/roadmap `docs/specs/2026-10-12-pos-product-tile-poster-spec.md`).
 * It knows nothing about products: a picture, marks and words. The frame keeps `m-1` and forwards
 * its ref, so the Deal measures and lifts it as before; a stack's cards are drawn inside that
 * frame, behind the square.
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
		onPress,
		accessibilityLabel,
		testID,
		squareTestID,
	},
	ref
) {
	const tint = picture.kind === 'tint' ? picture.tint : null;
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
						className={`aspect-square overflow-hidden rounded-lg border ${
							tint === null ? 'bg-card border-border' : `${TINTS[tint]} border-transparent`
						}`}
						testID={squareTestID}
					>
						<View
							className={`h-full w-full ${out ? (pressed ? 'opacity-30' : 'opacity-40') : pressed ? 'opacity-90' : ''}`}
							testID="poster-picture"
						>
							<Picture picture={picture} />
						</View>
						{words &&
							(tint === null ? (
								<Scrim
									className="absolute right-0 bottom-0 left-0 gap-[2px] px-[10px] pt-[48px] pb-[10px]"
									testID="poster-scrim"
								>
									{words}
								</Scrim>
							) : (
								<View
									className="absolute right-0 bottom-0 left-0 gap-[2px] p-[10px]"
									testID="poster-words"
								>
									{words}
								</View>
							))}
						{mark && (
							<View className="absolute top-2 left-2">
								<Mark mark={mark} label={markLabel} testID={markTestID} bare={tint !== null} />
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
