import * as React from 'react';
import { tap, switchMap, map } from 'rxjs/operators';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import Avatar from '@wcpos/common/src/components/avatar';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Button from '@wcpos/common/src/components/button';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Modal from './login-modal';
import { SiteWrapper, SiteTextWrapper } from './styles';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

interface ISiteProps {
	site: SiteDocument;
	user: UserDocument;
}
/**
 * Options for fetching favicons
 * - https://api.statvoo.com/favicon/?url=${url}
 * - https://www.google.com/s2/favicons?domain=${url}
 * - https://favicongrabber.com/api/grab/${url}
    
 * - https://api.faviconkit.com/${url}/144
 */
const Site = ({ site, user }: ISiteProps) => {
	const status = useObservableState(site.connection.status$) as string;
	const error = useObservableState(site.connection.error$) as string;
	const name = useObservableState(site.name$) as string;
	const [visible, setVisible] = React.useState(false);
	const { setLastUser } = useAppState();

	const [connectedWpUsers] = useObservableState(
		() =>
			site.wpCredentials$.pipe(
				switchMap((ids) => {
					const wpCredentialsCollection = get(
						site,
						'collection.database.collections.wp_credentials'
					);
					return wpCredentialsCollection.findByIds$(ids || []);
				}),
				// @ts-ignore
				map((wpCredentialsMap) => Array.from(wpCredentialsMap.values())),
				tap((res) => {
					console.log('@TODO - fix these unnecessary re-renders');
				})
			),
		[]
	);

	// const connectedWpUsers: [] = [];
	// debugger;

	const selectStore = async (wpUser: WPCredentialsDocument): Promise<void> => {
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
	};

	const handleRemove = async () => {
		await user.removeSite(site);
	};

	return (
		<SiteWrapper>
			<Avatar src={`https://api.faviconkit.com/${site.url}/144`} />
			<SiteTextWrapper>
				<Text weight="bold">{name || site.url}</Text>
				<Text size="small" type="secondary">
					{site.url}
				</Text>
				<Text size="small">{error}</Text>
				<Text size="small">{!error && status}</Text>
				{/* {error && <Text size="small">{error}</Text>}
				{status && !error && <Text size="small">{status}</Text>} */}

				<Button title="Connect" onPress={() => site.connect()} />
				<Button
					title="Login"
					onPress={() => {
						setVisible(true);
					}}
				/>
				{connectedWpUsers.map((connectedWpUser: WPCredentialsDocument) => {
					return (
						<Button
							key={connectedWpUser._id}
							title={connectedWpUser.displayName}
							onPress={() => {
								selectStore(connectedWpUser);
							}}
						/>
					);
				})}
			</SiteTextWrapper>
			<Button onPress={handleRemove}>
				<Icon name="remove" />
			</Button>
			{visible && <Modal site={site} user={user} visible={visible} setVisible={setVisible} />}
		</SiteWrapper>
	);
};

export default Site;
