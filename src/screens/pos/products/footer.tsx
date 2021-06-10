import * as React from 'react';
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

	return (
		<>
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
		</>
	);
};

export default ProductsFooter;
