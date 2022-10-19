import * as React from 'react';
import { useTheme } from 'styled-components/native';
import { useObservableState } from 'observable-hooks';
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
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.totalDocCount$, 0);
	const theme = useTheme();
	const http = useHttpClient();
	const { site, wpCredentials } = useAuth();
	const navigation = useNavigation();
	const { replicationState } = useProducts();

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
	const handleSync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	const handleClear = React.useCallback(() => {
		// storeDB.products.remove() will clear the collection instance, so I would need to re-create it
		// for the moment, I think it's better just to flush the collection

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
			<Icon name="arrowRotateRight" size="small" onPress={handleSync} />
			<Icon name="arrowRotateRight" size="small" onLongPress={handleClear} />
		</Box>
	);
};

export default ProductsFooter;
