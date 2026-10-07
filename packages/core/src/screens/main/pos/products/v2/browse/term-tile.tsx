import * as React from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../../components/product/product-image-placeholder';
import { type Measurable, useCopyPicture } from '../deal-stack';
import { type BrowseTerm, termKey } from './browse-source';

// A tile the deal has lifted off the grid: its copy is out on the stage.
const LIFTED = { opacity: 0 };
// An image that is already on screen and only changing place does not fade in again.
const STILL = { transition: 0 };
// The product tile's frame: same margin, border, radius, so term and product tiles share a grid.
const FRAME = 'border-border m-1 overflow-hidden rounded-lg border';
// A picture tile presses as a product tile does. A muted tile is muted all over (a grid row
// stretches its cells), so its press dims it: `active:bg-muted` would not show on it.
const CARD = 'bg-card active:bg-muted';
const MUTED = 'bg-muted active:opacity-70';

export function termTestId(term: BrowseTerm): string {
	if (term.kind === 'all') return 'browse-all-products';
	return `browse-${termKey(term)}`;
}

function hasImage(term: BrowseTerm): term is Extract<BrowseTerm, { kind: 'term' }> {
	return term.kind === 'term' && !!term.imageSrc;
}

/**
 * How the tile is sized. `flex-1`: a root row's share of the row. `own`: a level's child term in
 * a dealt cell keeps its own height — no flex at all. Yoga lays a cell out at most as tall as its
 * row, and a growing child (`grow`, `flex-1`) grows to that limit, so a growing term tile took the
 * row's height beside a taller tile whatever the cell's own alignment said (Pixel, 2026-10-07:
 * Jackets and Tanks at 476 px beside a two-line Hoodies & Sweatshirts; the owner's call is that
 * term tiles keep their own height). `grow`: the parent fills its cell, which is pinned to the
 * tapped tile's height while it is the copy.
 */
type TileSize = 'flex-1' | 'own' | 'grow';
function tileClass(term: BrowseTerm, size: TileSize) {
	return `${hasImage(term) ? CARD : MUTED} ${FRAME}${size === 'own' ? '' : ` ${size}`}`;
}

// The square a picture-less body keeps at least (see WordsBody): laid under its words.
const UNDER = { marginLeft: '-100%' } as const;

/**
 * A body without a picture: at least as tall as the tile is wide, taller when its words need it
 * (a dealt term tile keeps its own height now, and a fixed square cut a long name off), its words
 * clear of the parent copy's back badge. The badge (`top-2`, `size-6`) sits in the words' top
 * gutter (`pt-8`) on the tile and on its copy alike, so the copy lays its words out exactly as
 * the tile it came from — overlaid, the badge covered the end of the first line (Pixel,
 * 2026-10-07: "Uncategor‹").
 */
function WordsBody({ gap, children }: { gap: 'gap-1' | 'gap-2'; children: React.ReactNode }) {
	return (
		<View className="flex-row" testID="term-words-body">
			<View className="aspect-square w-full" />
			<View
				className={`w-full items-center justify-center ${gap} ${WORDS_PADDING}`}
				style={UNDER}
				testID="term-words"
			>
				{children}
			</View>
		</View>
	);
}
/** The words' padding: the badge's corner (`top-2` + `size-6`) is the top gutter. */
export const WORDS_PADDING = 'px-3 pt-8 pb-3';
/** The parent's back badge. */
export const BADGE =
	'bg-card absolute top-2 right-2 size-6 items-center justify-center rounded-full';

function TermImage({
	src,
	recyclingKey,
	still,
}: {
	src: string;
	recyclingKey: string;
	still?: boolean;
}) {
	// A term image the store has since deleted shows the product placeholder, not an empty square.
	const [failed, setFailed] = React.useState(false);
	// On a dealt parent's copy, the copy waits for this picture to paint (deal-stack.tsx).
	const painted = useCopyPicture();
	return (
		<Image
			source={{ uri: failed ? PRODUCT_IMAGE_PLACEHOLDER : src }}
			recyclingKey={recyclingKey}
			className="h-full w-full"
			onDisplay={painted}
			onError={() => {
				setFailed(true);
				painted?.();
			}}
			{...(still ? STILL : {})}
		/>
	);
}

function TermBody({ term, still }: { term: BrowseTerm; still?: boolean }) {
	const t = useT();
	if (term.kind === 'all') {
		return (
			<WordsBody gap="gap-2">
				<Icon name="grid" size="lg" className="text-muted-foreground" />
				<Text className="text-center font-bold" numberOfLines={2}>
					{t('pos_products.browse_all_products')}
				</Text>
			</WordsBody>
		);
	}
	if (term.kind === 'shortcut') {
		return (
			<WordsBody gap="gap-1">
				<Icon name="sliders" size="lg" className="text-muted-foreground" />
				<Text className="text-center text-lg font-bold" numberOfLines={2} decodeHtml>
					{term.name}
				</Text>
				<Text className="text-muted-foreground text-center" numberOfLines={2}>
					{term.description}
				</Text>
			</WordsBody>
		);
	}
	if (!term.imageSrc) {
		return (
			<WordsBody gap="gap-1">
				<Text className="text-center text-lg font-bold" numberOfLines={3} decodeHtml>
					{term.name}
				</Text>
				{/* The storefront's count; a term kept for its POS-only products has none to show. */}
				{term.count > 0 && (
					<Text className="text-muted-foreground text-center">
						{t('pos_products.n_products', { count: term.count })}
					</Text>
				)}
			</WordsBody>
		);
	}
	return (
		<>
			<View className="aspect-square" testID={`${termTestId(term)}-image`}>
				{/* Keyed by source: a new picture gets its own chance to load. */}
				<TermImage
					key={term.imageSrc}
					src={term.imageSrc}
					recyclingKey={termKey(term)}
					still={still}
				/>
			</View>
			<VStack className="p-2" space="xs">
				<Text className="font-bold" numberOfLines={2} decodeHtml>
					{term.name}
				</Text>
				{term.count > 0 && (
					<Text className="text-muted-foreground">
						{t('pos_products.n_products', { count: term.count })}
					</Text>
				)}
			</VStack>
		</>
	);
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
	/** In a dealt cell (a level's child term) the tile keeps its own height (see TileSize). */
	dealt?: boolean;
}) {
	const t = useT();
	const tile = React.useRef<ViewInstance>(null);
	const label = term.kind === 'all' ? t('pos_products.browse_all_products') : term.name;
	return (
		<Pressable
			ref={tile}
			onPress={() => onPress(term, tile.current)}
			style={lifted ? LIFTED : undefined}
			accessibilityRole="button"
			accessibilityLabel={label}
			className={tileClass(term, dealt ? 'own' : 'flex-1')}
			testID={termTestId(term)}
		>
			<TermBody term={term} />
		</Pressable>
	);
}

/** The term whose contents are out on the grid: slot 0, and tapping it is the way back. */
export function ParentTermTile({ term, onPress }: { term: BrowseTerm; onPress: () => void }) {
	const t = useT();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t('common.back')}
			className={tileClass(term, 'grow')}
			testID="browse-parent"
		>
			<View className="relative">
				{/* The same picture the tapped tile was showing: it moves, it does not arrive. */}
				<TermBody term={term} still />
				<View className={BADGE} testID="browse-parent-badge">
					<Icon name="chevronLeft" size="sm" className="text-muted-foreground" />
				</View>
			</View>
		</Pressable>
	);
}
