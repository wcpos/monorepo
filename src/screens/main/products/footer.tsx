import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableState, useSubscription } from 'observable-hooks';
import get from 'lodash/get';
import set from 'lodash/set';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Icon from '@wcpos/components/src/icon';
import useStore from '@wcpos/hooks/src/use-store';
import useAuth from '@wcpos/hooks/src/use-auth';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import useProducts from '@wcpos/core/src/contexts/products';
import { useNavigation } from '@react-navigation/native';

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

	/**
	 *
	 */
	const handleJWT = React.useCallback(() => {
		http.get(`${site.wc_api_auth_url}/refresh`).then((res) => {
			console.log(res);
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
			console.log('Products cleared');
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
			<Icon
				name="user"
				size="small"
				onPress={() => {
					navigation.navigate('Login');
				}}
			/>
			<Icon name="user" size="small" onPress={handleJWT} />
			<SyncButton />
			<Icon name="arrowRotateRight" size="small" onLongPress={handleClear} />
		</Box>
	);
};

export default ProductsFooter;
