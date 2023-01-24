import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useAuth from '../../../../../contexts/auth';
import useProducts from '../../../../../contexts/products';
import useStore from '../../../../../contexts/store';

interface ProductFooterProps {
	count: number;
}

/**
 *
 */
const SyncButton = () => {
	const { replicationState } = useProducts();
	const isSyncing = useObservableState(replicationState.active$, false);

	/**
	 *
	 */
	const handleSync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	return (
		<Icon
			name="arrowRotateRight"
			size="small"
			onPress={handleSync}
			type={isSyncing ? 'info' : 'warning'}
		/>
	);
};

/**
 *
 */
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);
	const theme = useTheme();
	const http = useHttpClient();
	const { site, wpCredentials } = useAuth();
	const navigation = useNavigation();
	const { sync } = useProducts();
	const [openMenu, setOpenMenu] = React.useState(false);

	/**
	 *
	 */
	const handleJWT = React.useCallback(() => {
		http.get(`${site.wc_api_auth_url}/refresh`).then((res) => {
			log.debug(res);
		});
	}, [http, site.wc_api_auth_url]);

	/**
	 *
	 */
	const handleClear = React.useCallback(() => {
		// storeDB.products.remove() will clear the collection instance, so I would need to re-create it
		// for the moment, I think it's better just to flush the collection

		// I probably need to clear the last checkpoint as well here

		Promise.all([storeDB?.products.clear(), storeDB?.variations.clear()]).then(() => {
			log.debug('Products cleared');
		});
	}, [storeDB?.products, storeDB?.variations]);

	/**
	 *
	 */
	return (
		<Box
			horizontal
			padding="small"
			space="xSmall"
			align="center"
			distribution="end"
			style={{
				backgroundColor: theme.colors.lightGrey,
				borderBottomLeftRadius: theme.rounding.medium,
				borderBottomRightRadius: theme.rounding.medium,
				borderTopWidth: 1,
				borderTopColor: theme.colors.grey,
			}}
		>
			<Text size="small">
				Showing {count} of {total}
			</Text>
			<Dropdown
				opened={openMenu}
				onClose={() => {
					setOpenMenu(false);
				}}
				placement="top-end"
				items={[
					{ label: 'Sync', action: sync, icon: 'arrowRotateRight' },
					{
						label: 'Clear and Refresh',
						action: handleClear,
						type: 'critical',
						icon: 'trash',
					},
				]}
				trigger="longpress"
			>
				<Icon
					name="arrowRotateRight"
					size="small"
					onPress={sync}
					onLongPress={() => {
						setOpenMenu(true);
					}}
					tooltip="Press to sync products, long press for more options"
					tooltipPlacement="top-end"
				/>
			</Dropdown>
		</Box>
	);
};

export default ProductsFooter;
