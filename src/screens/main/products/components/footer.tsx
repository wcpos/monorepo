import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useAuth from '../../../../contexts/auth';
import useStore from '../../../../contexts/store';
import SyncButton from '../../components/sync-button';
import useProducts from '../../contexts/products';

interface ProductFooterProps {
	count: number;
}

/**
 *
 */
const ProductsFooter = ({ count }: ProductFooterProps) => {
	const { storeDB } = useStore();
	const total = useObservableState(storeDB.products.count().$, 0);
	const theme = useTheme();
	const http = useHttpClient();
	const { site, wpCredentials } = useAuth();
	const navigation = useNavigation();
	const { sync, clear } = useProducts();

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
			<SyncButton sync={sync} clear={clear} />
		</Box>
	);
};

export default ProductsFooter;
