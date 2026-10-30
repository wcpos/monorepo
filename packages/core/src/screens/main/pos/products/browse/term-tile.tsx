import * as React from 'react';
import { type ViewInstance } from 'react-native';

import { useAnimatedStyle } from 'react-native-reanimated';

import {
	type PosterMark,
	type PosterPicture,
	PosterTile,
	SCRIM_BLUR_RADIUS,
	tintOf,
} from '@wcpos/components/poster-tile';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { type Measurable, useCopyPicture, useDealCards, useLiftedLayout } from '../deal-stack';
import { type BrowseTerm, termKey } from './browse-source';

// A shortcut is not a category: its glyph on the last tint.
const OTHER = { kind: 'tint', tint: 5 } as const;

export function termTestId(term: BrowseTerm): string {
	if (term.kind === 'all') return 'browse-all-products';
	return `browse-${termKey(term)}`;
}

// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };

/**
 * A term's image. On a dealt parent's copy the copy waits for it to paint (`useCopyPicture`):
 * only a term that shows an image holds the copy, so a tint deals at once.
 */
function TermImage({
	src,
	recyclingKey,
	still,
	onFailed,
}: {
	src: string;
	recyclingKey: string;
	still?: boolean;
	onFailed: () => void;
}) {
	const painted = useCopyPicture();
	return (
		<Image
			source={{ uri: src }}
			recyclingKey={recyclingKey}
			contentFit="cover"
			className="h-full w-full"
			onDisplay={painted}
			onError={() => {
				onFailed();
				painted?.();
			}}
			{...(still ? STILL : {})}
		/>
	);
}

/**
 * A term's image blurred, for the Poster's native scrim (web never mounts it). Bare: it holds no
 * dealt copy and reports no failure (the sharp one does both).
 */
function TermImageBlurred({ src, recyclingKey }: { src: string; recyclingKey: string }) {
	return (
		<Image
			source={{ uri: src }}
			blurRadius={SCRIM_BLUR_RADIUS}
			recyclingKey={`${recyclingKey}:blur`}
			contentFit="cover"
			className="h-full w-full"
			transition={0}
		/>
	);
}

/** A term's picture: its image, or its tint when it has none or the image fails. */
function useTermPicture(term: BrowseTerm, still?: boolean): PosterPicture {
	const src = term.kind === 'term' ? (term.imageSrc ?? '') : '';
	// Keyed by the source: a new picture gets its own chance to load.
	const [failed, setFailed] = React.useState<string | null>(null);
	if (term.kind === 'all') return { kind: 'fill' };
	if (term.kind !== 'term') return OTHER;
	if (!src || failed === src) return { kind: 'tint', tint: tintOf(term.id) };
	return {
		kind: 'slot',
		children: (
			<TermImage
				key={src}
				src={src}
				recyclingKey={termKey(term)}
				still={still}
				onFailed={() => setFailed(src)}
			/>
		),
		blurred: <TermImageBlurred key={src} src={src} recyclingKey={termKey(term)} />,
	};
}

/** The term's slots: its kind's glyph, its name, and its count or a shortcut's conditions. */
function useTermWords(term: BrowseTerm) {
	const t = useT();
	const label = term.kind === 'all' ? t('pos_products.browse_all_products') : term.name;
	const mark: PosterMark =
		term.kind === 'term'
			? { kind: 'folder' }
			: { kind: 'glyph', name: term.kind === 'all' ? 'viewGrid' : 'filters' };
	const sub =
		term.kind === 'shortcut' ? (
			<Text className="text-foreground/70" numberOfLines={2} decodeHtml>
				{term.description}
			</Text>
		) : // The storefront's count; a term kept for its POS-only products has none to show.
		term.kind === 'term' && term.count > 0 ? (
			<Text className="text-foreground/70 text-xs">
				{t('pos_products.n_products', { count: term.count })}
			</Text>
		) : null;
	return {
		t,
		label,
		mark,
		title: (
			<Text className="leading-tight font-bold" numberOfLines={2} decodeHtml>
				{label}
			</Text>
		),
		sub,
	};
}

/** A term as a tile: tapping it opens the term (the tile goes along so the deal can start from it). */
export function TermTile({
	term,
	onPress,
	lifted,
	dealt,
}: {
	term: BrowseTerm;
	onPress: (term: BrowseTerm, target?: Measurable) => void;
	lifted?: boolean;
	/** In a dealt cell (a level's child term) the tile grows to its cell, which its row sizes. */
	dealt?: boolean;
}) {
	const tile = React.useRef<ViewInstance>(null);
	const { label, mark, title, sub } = useTermWords(term);
	const picture = useTermPicture(term);
	const onLayout = useLiftedLayout(lifted);
	return (
		<PosterTile
			ref={tile}
			picture={picture}
			mark={mark}
			title={title}
			sub={sub}
			// A tile that opens onto more tiles is a stack (owner, 2026-10-13).
			stacked
			grow={dealt}
			lifted={lifted}
			onLayout={onLayout}
			onPress={() => onPress(term, tile.current)}
			accessibilityLabel={label}
			testID={termTestId(term)}
			// The square is the term's picture only while it shows one.
			squareTestID={picture.kind === 'slot' ? `${termTestId(term)}-image` : undefined}
		/>
	);
}

/** The term whose contents are out on the grid: slot 0, and tapping it is the way back. */
export function ParentTermTile({ term, onPress }: { term: BrowseTerm; onPress: () => void }) {
	// Its cards leave as its contents are dealt and come back as they gather, as a product's do.
	const cards = useDealCards();
	const stackStyle = useAnimatedStyle(() => ({
		opacity: cards ? Math.min(1, Math.max(0, cards.value)) : 1,
	}));
	const { t, mark, title, sub } = useTermWords(term);
	// The same picture the tapped tile was showing: it moves, it does not arrive.
	const picture = useTermPicture(term, true);
	return (
		<PosterTile
			picture={picture}
			mark={mark}
			back
			backTestID="browse-parent-badge"
			stacked
			stackStyle={stackStyle}
			title={title}
			sub={sub}
			grow
			onPress={onPress}
			accessibilityLabel={t('common.back')}
			testID="browse-parent"
		/>
	);
}
