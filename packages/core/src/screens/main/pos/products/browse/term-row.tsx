import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { usePointer } from '@wcpos/components/lib/device';
import { ListRow } from '@wcpos/components/list-row';
import { PosterThumb, tintOf } from '@wcpos/components/poster-tile';
import { Text } from '@wcpos/components/text';

import { useUISettings } from '../../../contexts/ui-settings';
import { getColumnStyle } from '../../../components/data-table/column-style';
import { useT } from '../../../../../contexts/translations';
import { type BrowseTerm, termKey } from './browse-source';
import { termTestId } from './term-tile';

// Must match initial-settings.json: pos-products.columns[image].width.
export const TERM_IMAGE_COLUMN_WIDTH = 68;

/** A term as a row of the products card: thumb, name and count, a chevron at the end. */
/**
 * Whether the products table's image column is on: a term row shows its thumb with it. Read by
 * the lists that mount term rows, never by the row (the gallery mounts rows with no settings).
 */
export function useImageColumnShown() {
	const { uiSettings } = useUISettings('pos-products');
	return uiSettings.columns.find((column) => column.key === 'image')?.show !== false;
}

export function TermRow({
	term,
	onPress,
	showImage = true,
}: {
	term: BrowseTerm;
	onPress: (term: BrowseTerm) => void;
	/** The image column is on (`useImageColumnShown`). */
	showImage?: boolean;
}) {
	const t = useT();
	const pointer = usePointer();
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
		<ListRow
			size="sm"
			onPress={() => onPress(term)}
			accessibilityLabel={name}
			// It sits among the products table's rows, so it keeps their height; on a fine pointer
			// its thumb and name sit in the table's own columns, which carry the padding.
			className={pointer === 'fine' ? 'gap-0 px-0 py-0' : 'py-0'}
			bodyClassName={pointer === 'fine' ? 'gap-0.5 px-3 py-1.5' : 'gap-0.5'}
			testID={termTestId(term)}
			trailing={<Icon name="chevronRight" className="text-muted-foreground" />}
			leading={
				showImage && (
					<View
						style={getColumnStyle({ width: TERM_IMAGE_COLUMN_WIDTH })}
						className={pointer === 'fine' ? 'px-3 py-1.5' : undefined}
					>
						<PosterThumb
							stacked
							size={pointer === 'coarse' ? 'md' : 'sm'}
							picture={
								term.kind === 'term' && term.imageSrc
									? { kind: 'image', source: { uri: term.imageSrc }, recyclingKey: termKey(term) }
									: { kind: 'tint', tint: term.kind === 'term' ? tintOf(term.id) : 5 }
							}
							mark={
								term.kind === 'term'
									? { kind: 'folder' }
									: { kind: 'glyph', name: term.kind === 'all' ? 'viewGrid' : 'filters' }
							}
						/>
					</View>
				)
			}
		>
			<Text className="font-bold" numberOfLines={1} decodeHtml>
				{name}
			</Text>
			{sub ? (
				<Text className="text-muted-foreground text-xs" numberOfLines={1}>
					{sub}
				</Text>
			) : null}
		</ListRow>
	);
}
