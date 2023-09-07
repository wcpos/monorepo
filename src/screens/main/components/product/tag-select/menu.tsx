import * as React from 'react';
import { View, FlatList } from 'react-native';

import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Loader from '@wcpos/components/src/loader';
import { usePopover } from '@wcpos/components/src/popover/context';
import Pressable from '@wcpos/components/src/pressable';

import TagSelectItem, { EmptyTableRow } from './item';

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
const TagSelectMenu = ({ query, onSelect }) => {
	const theme = useTheme();
	const tags = useObservableSuspense(query.resource);
	const loading = useObservableState(query.replicationState.active$, false);
	const { targetMeasurements } = usePopover();

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
	const renderItem = React.useCallback(
		({ item }) => {
			return (
				<Pressable onPress={() => onSelect(item)} style={calculatedStyled}>
					<TagSelectItem tag={item} />
				</Pressable>
			);
		},
		[calculatedStyled, onSelect]
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
			<FlatList<ProductTagDocument>
				data={tags}
				renderItem={renderItem}
				// estimatedItemSize={32}
				ListEmptyComponent={<EmptyTableRow />}
				onEndReached={() => query.nextPage()}
				ListFooterComponent={loading ? Loader : null}
			/>
		</View>
	);
};

export default TagSelectMenu;
