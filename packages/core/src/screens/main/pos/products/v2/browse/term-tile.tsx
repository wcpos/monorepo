import * as React from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../../components/product/product-image-placeholder';
import { type BrowseTerm, termKey } from './browse-source';

import type { Measurable } from '../deal-stack';

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

// In a dealt cell the tile grows to its row's height; `flex-1` would give it no height of
// its own inside the cell.
function tileClass(term: BrowseTerm, size: 'flex-1' | 'grow') {
	return `${hasImage(term) ? CARD : MUTED} ${FRAME} ${size}`;
}

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
	return (
		<Image
			source={{ uri: failed ? PRODUCT_IMAGE_PLACEHOLDER : src }}
			recyclingKey={recyclingKey}
			className="h-full w-full"
			onError={() => setFailed(true)}
			{...(still ? STILL : {})}
		/>
	);
}

function TermBody({ term, still }: { term: BrowseTerm; still?: boolean }) {
	const t = useT();
	if (term.kind === 'all') {
		return (
			<View className="aspect-square items-center justify-center gap-2 p-3">
				<Icon name="grid" size="lg" className="text-muted-foreground" />
				<Text className="text-center font-bold" numberOfLines={2}>
					{t('pos_products.browse_all_products')}
				</Text>
			</View>
		);
	}
	if (term.kind === 'shortcut') {
		return (
			<View className="aspect-square items-center justify-center gap-1 p-3">
				<Icon name="sliders" size="lg" className="text-muted-foreground" />
				<Text className="text-center text-lg font-bold" numberOfLines={2} decodeHtml>
					{term.name}
				</Text>
				<Text className="text-muted-foreground text-center text-xs" numberOfLines={2}>
					{term.description}
				</Text>
			</View>
		);
	}
	if (!term.imageSrc) {
		return (
			<View className="aspect-square items-center justify-center gap-1 p-3">
				<Text className="text-center text-lg font-bold" numberOfLines={3} decodeHtml>
					{term.name}
				</Text>
				{/* The storefront's count; a term kept for its POS-only products has none to show. */}
				{term.count > 0 && (
					<Text className="text-muted-foreground text-center">
						{t('pos_products.n_products', { count: term.count })}
					</Text>
				)}
			</View>
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
}: {
	term: BrowseTerm;
	onPress: (term: BrowseTerm, target?: Measurable) => void;
	lifted?: boolean;
}) {
	const tile = React.useRef<ViewInstance>(null);
	const label = term.kind === 'all' ? undefined : term.name;
	return (
		<Pressable
			ref={tile}
			onPress={() => onPress(term, tile.current)}
			style={lifted ? LIFTED : undefined}
			accessibilityRole="button"
			accessibilityLabel={label}
			className={tileClass(term, 'flex-1')}
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
				<View className="bg-card absolute top-2 right-2 size-6 items-center justify-center rounded-full">
					<Icon name="chevronLeft" size="sm" className="text-muted-foreground" />
				</View>
			</View>
		</Pressable>
	);
}
