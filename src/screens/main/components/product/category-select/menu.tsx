import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense, useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import { Avatar } from '@wcpos/components/src/avatar/avatar';
import Box from '@wcpos/components/src/box';
import { FlashList } from '@wcpos/components/src/flash-list';
import Loader from '@wcpos/components/src/loader';
import { usePopover } from '@wcpos/components/src/popover/context';
import Pressable from '@wcpos/components/src/pressable';

import CategorySelectItem, { EmptyTableRow } from './item';
import { t } from '../../../../../lib/translations';
import { useProductCategories } from '../../../contexts/categories';
import useTotalCount from '../../../hooks/use-total-count';

type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

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

interface CategorySelectMenuHandles {
	onSearch: (query: string) => void;
}

interface CategorySelectMenuProps {
	onChange: (item: ProductCategoryDocument) => void;
}

/**
 *
 */
const CategorySelectMenu = React.forwardRef<CategorySelectMenuHandles, CategorySelectMenuProps>(
	({ onChange }, ref) => {
		const theme = useTheme();
		const { paginatedResource, setDebouncedQuery, replicationState, loadNextPage } =
			useProductCategories();
		const { data: categories, count, hasMore } = useObservableSuspense(paginatedResource);
		const loading = useObservableState(replicationState.active$, false);
		const total = useTotalCount('products/categories', replicationState);
		const { targetMeasurements } = usePopover();

		/**
		 * Use useImperativeHandle to expose setQuery function
		 */
		React.useImperativeHandle(ref, () => ({
			onSearch: (search) => {
				setDebouncedQuery('search', search);
			},
		}));

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
					<Pressable onPress={() => onChange(item)} style={calculatedStyled}>
						<CategorySelectItem category={item} />
					</Pressable>
				);
			},
			[calculatedStyled, onChange]
		);

		/**
		 *
		 */
		const onEndReached = React.useCallback(() => {
			if (hasMore) {
				loadNextPage();
			} else if (!loading && total > count) {
				replicationState.start({ fetchRemoteIDs: false });
			}
		}, [count, hasMore, loadNextPage, loading, replicationState, total]);

		/**
		 *
		 */
		return (
			<View style={{ width: targetMeasurements.value.width, maxHeight: 292, minHeight: 30 }}>
				<FlashList<ProductCategoryDocument>
					data={categories}
					renderItem={renderItem}
					estimatedItemSize={32}
					ListEmptyComponent={<EmptyTableRow />}
					onEndReached={onEndReached}
					ListFooterComponent={loading ? Loader : null}
				/>
			</View>
		);
	}
);

export default React.memo(CategorySelectMenu);
