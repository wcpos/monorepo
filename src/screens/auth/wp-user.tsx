import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import axios from 'axios';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import forEach from 'lodash/forEach';
import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';
import Button from '@wcpos/components/src/button';
import Dialog, { useDialog } from '@wcpos/components/src/dialog';
import * as Styled from './styles';

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

const WpUser = ({ site, wpUser }: Props) => {
	const [stores] = useObservableState(wpUser.getStores$, []);
	const { ref: dialogRef, open: openConfirmDialog } = useDialog();

	// 	/**
	//  * Populate stores on first render
	//  */
	React.useEffect(() => {
		axios
			.get(`${site.getWcposApiUrl()}/stores`, {
				headers: { 'X-WCPOS': '1', Authorization: `Bearer ${wpUser.jwt}` },
			})
			.then((response) => {
				// @ts-ignore
				wpUser.addOrUpdateStores(response.data);
			});
	}, []);

	/**
	 *
	 */
	const handleStoreSelect = React.useCallback(async () => {
		if (stores.length === 1) {
			site.collection.upsertLocal('current', { id: site.localID });
			wpUser.collection.upsertLocal('current', { id: wpUser.localID });
			stores[0].collection.upsertLocal('current', { id: stores[0].localID });
		}
	}, [site, stores, wpUser]);

	/**
	 *
	 */
	const handleUserRemove = React.useCallback(
		async (confirm) => {
			if (!confirm) return;
			forEach(wpUser.stores, async (id) => {
				// const db = await DatabaseService.getStoreDB(sanitizeStoreName(id));
				// await db?.remove();
			});
			// need to remove wpUser from site from site
			await site.update({
				$pullAll: {
					wpCredentials: [wpUser.localID],
				},
			});
			await wpUser.remove();
		},
		[site, wpUser]
	);

	return (
		<>
			<Pill
				removable
				onPress={handleStoreSelect}
				onRemove={openConfirmDialog}
				disabled={stores.length === 0}
			>
				{wpUser.display_name ? wpUser.display_name : 'No name?'}
			</Pill>

			<Dialog ref={dialogRef} onClose={handleUserRemove}>
				Remove logged in user?
			</Dialog>
		</>
	);
};

export default WpUser;
