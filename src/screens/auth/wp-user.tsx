import * as React from 'react';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import Tag from '@wcpos/common/src/components/tag';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

interface Props {
	site: import('@wcpos/common/src/database').SiteDocument;
	wpUser: import('@wcpos/common/src/database').WPCredentialsDocument;
}

const WpUser = ({ site, wpUser }: Props) => {
	const { setLastUser } = useAppState();

	/**
	 *
	 */
	const handleStoreSelect = React.useCallback(async () => {
		let store;
		// hack: set a default store if none exits
		if (isEmpty(wpUser.stores)) {
			const storesCollection = get(wpUser, 'collection.database.collections.stores');
			// @ts-ignore
			store = await storesCollection.insert({ id: 0, name: 'Default Store' });
			wpUser.atomicPatch({ stores: [store._id] });
		} else {
			[store] = await wpUser.populate('stores');
		}
		setLastUser(store._id, site, wpUser);
	}, [setLastUser, site, wpUser]);

	/**
	 *
	 */
	const handleWpUserRemove = React.useCallback(async () => {
		console.log(wpUser);
	}, []);

	return (
		<Tag removable onPress={handleStoreSelect} onRemove={handleWpUserRemove}>
			{wpUser.displayName ? wpUser.displayName : 'No name?'}
		</Tag>
	);
};

export default WpUser;
