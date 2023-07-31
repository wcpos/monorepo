import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import { FlashList } from '@wcpos/components/src/flash-list';
import Loader from '@wcpos/components/src/loader';
import { usePopover } from '@wcpos/components/src/popover/context';
import Pressable from '@wcpos/components/src/pressable';

import TagSelectItem, { EmptyTableRow } from './item';
import { useStoreStateManager } from '../../../../../contexts/store-state-manager';
import { useProductTags } from '../../../contexts/tags';
import useTotalCount from '../../../hooks/use-total-count';

type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

/**
 * TODO - this is taken from the menu component, should be moved to a shared location
 */
const convertHexToRGBA = (hexCode, opacity = 1) => {
	let hex = hexCode.replace('#', '');

	if (hex.length === 3) {
		hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
	}

	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	/* Backward compatibility for whole number based opacity values. */
	if (opacity > 1 && opacity <= 100) {
		opacity = opacity / 100;
	}

	return `rgba(${r},${g},${b},${opacity})`;
};

interface TagSelectMenuHandles {
	onSearch: (query: string) => void;
}

interface TagSelectMenuProps {
	onChange: (item: ProductTagDocument) => void;
}

/**
 *
 */
const TagSelectMenu = ({ query }) => {
	const theme = useTheme();
	const tags = useObservableSuspense(query.resource);

	// const { paginatedResource, replicationState, loadNextPage } = useProductTags();
	// const { data: tags, count, hasMore } = useObservableSuspense(paginatedResource);
	// const loading = useObservableState(replicationState.active$, false);
	// const total = useTotalCount('products/categories', replicationState);
	const { targetMeasurements } = usePopover();
	const manager = useStoreStateManager();

	/**
	 *
	 */
	const calculatedStyled = React.useCallback(
		({ hovered }) => {
			const hoverBackgroundColor = convertHexToRGBA(theme.colors['primary'], 0.1);
			return [
				{
					padding: theme.spacing.small,
					flex: 1,
					flexDirection: 'row',
					backgroundColor: hovered ? hoverBackgroundColor : 'transparent',
				},
			];
		},
		[theme]
	);

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(tag) => {
			const query = manager.getQuery(['products']);
			query.where('tags', { $elemMatch: { id: tag.id } });
		},
		[manager]
	);

	/**
	 *
	 */
	const renderItem = React.useCallback(
		({ item }) => {
			return (
				<Pressable onPress={() => handleSelect(item)} style={calculatedStyled}>
					<TagSelectItem tag={item} />
				</Pressable>
			);
		},
		[calculatedStyled, handleSelect]
	);

	/**
	 *
	 */
	// const onEndReached = React.useCallback(() => {
	// 	if (hasMore) {
	// 		loadNextPage();
	// 	} else if (!loading && total > count) {
	// 		replicationState.start({ fetchRemoteIDs: false });
	// 	}
	// }, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	return (
		<View style={{ width: targetMeasurements.value.width, maxHeight: 292, minHeight: 30 }}>
			<FlashList<ProductTagDocument>
				data={tags}
				renderItem={renderItem}
				estimatedItemSize={32}
				ListEmptyComponent={<EmptyTableRow />}
				// onEndReached={onEndReached}
				// ListFooterComponent={loading ? Loader : null}
			/>
		</View>
	);
};

export default TagSelectMenu;
