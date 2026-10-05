import * as React from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../../contexts/translations';
import { type BrowseTerm, termKey } from './browse-source';

import type { Measurable } from '../deal-stack';

// A tile the deal has lifted off the grid: its copy is out on the stage.
const LIFTED = { opacity: 0 };
// The product tile's frame: same margin, border, radius, so term and product tiles share a grid.
const TILE = 'bg-card border-border active:bg-muted m-1 flex-1 overflow-hidden rounded-lg border';

export function termTestId(term: BrowseTerm): string {
	if (term.kind === 'all') return 'browse-all-products';
	return `browse-${termKey(term)}`;
}

function TermBody({ term }: { term: BrowseTerm }) {
	const t = useT();
	if (term.kind === 'all') {
		return (
			<View className="bg-muted aspect-square items-center justify-center gap-2 p-3">
				<Icon name="grid" size="lg" className="text-muted-foreground" />
				<Text className="text-center font-bold" numberOfLines={2}>
					{t('pos_products.browse_all_products')}
				</Text>
			</View>
		);
	}
	if (term.kind === 'shortcut') {
		return (
			<View className="bg-muted aspect-square items-center justify-center gap-1 p-3">
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
			<View className="bg-muted aspect-square items-center justify-center gap-1 p-3">
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
				<Image
					source={{ uri: term.imageSrc }}
					recyclingKey={termKey(term)}
					className="h-full w-full"
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
			className={TILE}
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
			// `grow`, not `flex-1`: inside a dealt cell the tile takes its row's height.
			className="bg-card border-border active:bg-muted m-1 grow overflow-hidden rounded-lg border"
			testID="browse-parent"
		>
			<View className="relative">
				<TermBody term={term} />
				<View className="bg-card absolute top-2 right-2 size-6 items-center justify-center rounded-full">
					<Icon name="chevronLeft" size="sm" className="text-muted-foreground" />
				</View>
			</View>
		</Pressable>
	);
}
