import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { Image } from '../image';
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
	return (
		<View
			className={`relative overflow-visible ${size === 'md' ? 'size-14' : 'size-10'}`}
			testID={testID}
		>
			{stacked && (
				<View style={StyleSheet.absoluteFill} testID="poster-stack">
					<View className={CARD} style={FAR} />
					<View className={CARD} style={NEAR} />
				</View>
			)}
			<View
				className={`h-full w-full overflow-hidden rounded-lg border ${tint === null ? 'bg-card border-border' : `${TINTS[tint]} border-transparent`} ${out ? 'opacity-40' : ''}`}
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
						tint === null
							? 'absolute -top-1 -left-1'
							: 'absolute inset-0 items-center justify-center'
					}
				>
					<Mark mark={mark} bare={tint !== null} compact />
				</View>
			)}
		</View>
	);
}
