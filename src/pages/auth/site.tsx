import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Avatar from '../../components/avatar';
import Text from '../../components/text';
import Icon from '../../components/icon';
import Button from '../../components/button';
import Modal from './modal';
import { SiteWrapper, SiteTextWrapper } from './styles';
import useAppState from '../../hooks/use-app-state';

interface ISiteProps {
	site: any;
	index: number;
}
/**
 * Options for fetching favicons
 * - https://api.statvoo.com/favicon/?url=${url}
 * - https://www.google.com/s2/favicons?domain=${url}
 * - https://favicongrabber.com/api/grab/${url}
    
 * - https://api.faviconkit.com/${url}/144
 */
const Site = ({ site, index }: ISiteProps) => {
	// const status = useObservableState(site.connection_status$);
	const [visible, setVisible] = React.useState(false);
	const [{ user }, dispatch, actions] = useAppState();

	const selectStore = async (): Promise<void> => {
		const storeDB = await user.getStoreDB(site.wp_credentials[0].stores[0].id);
		dispatch({
			type: actions.SET_STORE,
			payload: { storeDB, storePath: `1.sites.${index}.wp_credentials.0.stores.0` },
		});
	};

	const handleRemove = async (): Promise<void> => {
		await user.removeSiteById(site.id);
	};

	return (
		<SiteWrapper>
			<Avatar src={`https://api.faviconkit.com/${site.id}/144`} />
			<SiteTextWrapper>
				<Text weight="bold">{site?.name || site.id}</Text>
				<Text size="small" type="secondary">
					{site.id}
				</Text>
				{/* {status && <Text size="small">{status?.message}</Text>} */}
				<Button title="Connect again" onPress={() => user.connectSite(site.id)} />
				{site.wp_credentials?.length > 0 && <Button title="Enter" onPress={() => selectStore()} />}
				{site.wc_api_auth_url && site.wp_credentials?.length === 0 && (
					<Button
						title="Login"
						onPress={() => {
							setVisible(true);
						}}
					/>
				)}
			</SiteTextWrapper>
			<Button onPress={handleRemove}>
				<Icon name="remove" />
			</Button>
			{visible && <Modal site={site} user={user} visible={visible} setVisible={setVisible} />}
		</SiteWrapper>
	);
};

export default Site;
