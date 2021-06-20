import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import useAuthLogin from '@wcpos/common/src/hooks/use-auth-login';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type UserDocument = import('@wcpos/common/src/database').UserDocument;

const ProductsFooter = () => {
	const showAuthLogin = useAuthLogin();
	const { storeDB } = useAppState() as { user: UserDocument; storeDB: StoreDatabase };
	const [syncing, setSyncing] = React.useState(false);
	const products = useObservableState(storeDB.collections.products.find().$, []);

	return (
		<>
			<Button
				title="Fetch all ids"
				onPress={async () => {
					// @ts-ignore
					const { data } = await storeDB.httpClient.get('products', {
						params: { fields: ['id', 'name'], posts_per_page: -1 },
					});
					// @ts-ignore
					await storeDB.collections.products.auditIdsFromServer(data);
				}}
			/>
			<Button
				title="Start Sync"
				onPress={async () => {
					// @ts-ignore
					const replicationState = storeDB.products.syncRestApi({
						url: 'products',
						pull: {},
						live: true,
					});
					replicationState.error$.subscribe((err: any) => {
						console.error('replication error:');
						console.dir(err);
						if (err.code === 401) {
							showAuthLogin();
						}
					});
					replicationState.active$.subscribe((value: boolean) => {
						setSyncing(value);
					});
					replicationState.run(false);
				}}
			/>
			<Text>{syncing ? 'syncing' : 'finished'}</Text>
			<Text>{products.length}</Text>
		</>
	);
};

export default ProductsFooter;
