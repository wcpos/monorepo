import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../../contexts/translations';
import { type BrowseTerm, termKey } from './browse-source';
import { termTestId } from './term-tile';

/** A term as a row of the products card: thumb, name and count, a chevron at the end. */
export function TermRow({
	term,
	onPress,
}: {
	term: BrowseTerm;
	onPress: (term: BrowseTerm) => void;
}) {
	const t = useT();
	const name = term.kind === 'all' ? t('pos_products.browse_all_products') : term.name;
	// The storefront's count; a term kept for its POS-only products has none to show.
	const sub =
		term.kind === 'term'
			? term.count > 0
				? t('pos_products.n_products', { count: term.count })
				: undefined
			: term.kind === 'shortcut'
				? term.description
				: undefined;
	return (
		<Pressable
			onPress={() => onPress(term)}
			accessibilityRole="button"
			accessibilityLabel={name}
			className="border-border active:bg-muted min-h-row flex-row items-center gap-3 border-b px-2"
			testID={termTestId(term)}
		>
			<View className="bg-muted size-10 items-center justify-center overflow-hidden rounded-lg">
				{term.kind === 'term' && term.imageSrc ? (
					<Image
						source={{ uri: term.imageSrc }}
						recyclingKey={termKey(term)}
						className="h-full w-full"
					/>
				) : term.kind === 'all' ? (
					<Icon name="grid" className="text-muted-foreground" />
				) : term.kind === 'shortcut' ? (
					<Icon name="sliders" className="text-muted-foreground" />
				) : (
					<Text className="text-muted-foreground font-bold">{term.name.slice(0, 1)}</Text>
				)}
			</View>
			<View className="flex-1 gap-0.5">
				<Text numberOfLines={1} decodeHtml>
					{name}
				</Text>
				{sub ? (
					<Text className="text-muted-foreground text-xs" numberOfLines={1}>
						{sub}
					</Text>
				) : null}
			</View>
			<Icon name="chevronRight" className="text-muted-foreground" />
		</Pressable>
	);
}
