import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { Image } from '../image';
import { TextClassContext } from '../text/context';
import { Mark } from './mark';
import { CARD, FAR, NEAR, TINTS } from './style';

import type { PosterMark, PosterPicture } from './index';

export type PosterThumbProps = {
	picture: PosterPicture;
	mark?: Extract<PosterMark, { kind: 'folder' | 'glyph' }>;
	stacked?: boolean;
	out?: boolean;
	size?: 'md' | 'sm';
	testID?: string;
};

export function PosterThumb({
	picture,
	mark,
	stacked,
	out,
	size = 'md',
	testID,
}: PosterThumbProps) {
	const tint = picture.kind === 'tint' ? picture.tint : null;
	const filled = picture.kind === 'fill';
	const ink = filled ? 'text-primary-foreground' : undefined;
	return (
		<View
			className={`relative overflow-visible ${size === 'md' ? 'size-14' : 'size-10'}`}
			// The cards under a stack reach FAR past the thumb's own square; the box keeps that room,
			// so a row's padding is measured from the last card, not from a square it draws past.
			style={stacked ? { marginRight: FAR.top, marginBottom: FAR.top } : undefined}
			testID={testID}
		>
			{stacked && (
				<View style={StyleSheet.absoluteFill} testID="poster-stack">
					<View className={CARD} style={FAR} />
					<View className={CARD} style={NEAR} />
				</View>
			)}
			<View
				className={`h-full w-full overflow-hidden rounded-lg border ${filled ? 'bg-primary border-transparent' : tint === null ? 'bg-card border-border' : `${TINTS[tint]} border-transparent`} ${out ? 'opacity-40' : ''}`}
			>
				<View className="h-full w-full">
					{picture.kind === 'slot' ? (
						picture.children
					) : picture.kind === 'image' || picture.kind === 'mosaic' ? (
						<Image
							source={picture.kind === 'image' ? picture.source : picture.sources[0]}
							recyclingKey={picture.kind === 'image' ? picture.recyclingKey : undefined}
							contentFit="cover"
							className="h-full w-full"
						/>
					) : null}
				</View>
			</View>
			{mark && (
				<View
					className={
						tint === null && !filled
							? 'absolute -top-1 -left-1'
							: 'absolute inset-0 items-center justify-center'
					}
				>
					<TextClassContext.Provider value={ink}>
						<Mark mark={mark} bare={tint !== null || filled} compact />
					</TextClassContext.Provider>
				</View>
			)}
		</View>
	);
}
