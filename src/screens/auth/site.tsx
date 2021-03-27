import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Avatar from '@wcpos/common/src/components/avatar';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Button from '@wcpos/common/src/components/button';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Modal from './login-modal';
import { SiteWrapper, SiteTextWrapper } from './styles';

type SiteDocument = import('@wcpos/common/src/database/sites').SiteDocument;
type UserDocument = import('@wcpos/common/src/database/users').UserDocument;

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

	const selectStore = async (): Promise<void> => {
		// const storeDB = await user.getStoreDB(site.wp_credentials[0].stores[0].id);
		// dispatch({
		// 	type: actions.SET_STORE,
		// 	payload: { storeDB, storePath: `1.sites.${index}.wp_credentials.0.stores.0` },
		// });
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
				{error && <Text size="small">{error}</Text>}
				{status && !error && <Text size="small">{status}</Text>}

				<Button title="Connect" onPress={() => site.connect()} />
				<Button
					title="Login"
					onPress={() => {
						setVisible(true);
					}}
				/>

				{/* {site.wp_credentials?.length > 0 && <Button title="Enter" onPress={() => selectStore()} />}
				{site.wc_api_auth_url && site.wp_credentials?.length === 0 && (
					<Button
						title="Login"
						onPress={() => {
							setVisible(true);
						}}
					/>
				)} */}
			</SiteTextWrapper>
			<Button onPress={handleRemove}>
				<Icon name="remove" />
			</Button>
			{visible && <Modal site={site} user={user} visible={visible} setVisible={setVisible} />}
		</SiteWrapper>
	);
};

export default Site;
