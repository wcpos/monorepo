import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import axios from 'axios';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import forEach from 'lodash/forEach';
import Tag from '@wcpos/common/src/components/tag';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Dialog from '@wcpos/common/src/components/dialog';
import * as Styled from './styles';

interface Props {
	site: import('@wcpos/common/src/database').SiteDocument;
	wpUser: import('@wcpos/common/src/database').WPCredentialsDocument;
}

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

const WpUser = ({ site, wpUser }: Props) => {
	const [showDialog, setShowDialog] = React.useState(false);
	const [stores] = useObservableState(wpUser.getStores$, []);

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
	const handleStoreRemove = React.useCallback(async () => {
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

		setShowDialog(false);
	}, [site, wpUser]);

	/**
	 *
	 */
	const handleWpUserRemove = React.useCallback(() => {
		setShowDialog(true);
	}, [setShowDialog]);

	return (
		<>
			<Tag
				removable
				onPress={handleStoreSelect}
				onRemove={handleWpUserRemove}
				disabled={stores.length === 0}
			>
				{wpUser.displayName ? wpUser.displayName : 'No name?'}
			</Tag>
			{showDialog && (
				<Dialog
					title="Delete User"
					open
					onClose={() => {
						setShowDialog(false);
					}}
					primaryAction={{ label: 'Confirm', action: handleStoreRemove, type: 'critical' }}
					secondaryActions={[
						{
							label: 'Cancel',
							action: () => {
								setShowDialog(false);
							},
						},
					]}
				>
					<Dialog.Section>
						<Text>You are about to remove all stores associated with this user</Text>
					</Dialog.Section>
				</Dialog>
			)}
		</>
	);
};

export default WpUser;
