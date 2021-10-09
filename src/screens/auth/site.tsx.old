import * as React from 'react';
import { View } from 'react-native';
import { tap, switchMap, map } from 'rxjs/operators';
import { useObservableState } from 'observable-hooks';
import { useNavigation } from '@react-navigation/native';
import Avatar from '@wcpos/common/src/components/avatar';
import Text from '@wcpos/common/src/components/text';
import Button from '@wcpos/common/src/components/button';
import Icon from '@wcpos/common/src/components/icon';
import Dialog from '@wcpos/common/src/components/dialog';
import Modal from './login-modal';
import WpUser from './wp-user';
import * as Styled from './styles';

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
	const status = useObservableState(site.connection.status$);
	const active = useObservableState(site.connection.active$);
	const name = useObservableState(site.name$) as string;
	const [visible, setVisible] = React.useState(false);
	const [openConfirmDialog, setOpenConfirmDialog] = React.useState(false);
	const showConfirmDialog = React.useCallback(() => setOpenConfirmDialog(true), []);
	const hideConfirmDialog = React.useCallback(() => setOpenConfirmDialog(false), []);
	const navigation = useNavigation();

	/**  */
	const [wpUsers] = useObservableState(site.getWpCredentials$, []);

	const handleRemoveSite = async () => {
		await user.removeSite(site);
	};

	/**
	 *
	 */
	const renderStatus = React.useMemo(() => {
		if (!status) {
			return null;
		}

		// @ts-ignore
		return <Text size="small">{status.message}</Text>;
	}, [status]);

	/**
	 *
	 */
	const renderActiveIcon = React.useMemo(() => {
		let type = 'secondary';
		if (active) {
			type = 'success';
		}
		if (status && status.type === 'error') {
			type = 'critical';
		}

		// @ts-ignore
		return <Icon name="circle" type={type} size="x-small" />;
	}, [active, status]);

	/**
	 *
	 */
	const renderWpUsers = React.useMemo(() => {
		if (!active) {
			return null;
		}

		return (
			<>
				<View style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Text style={{ marginRight: 5 }}>Logged in users</Text>
					<Button
						size="small"
						title="Add new user"
						type="secondary"
						background="outline"
						onPress={() => {
							// @ts-ignore
							navigation.navigate('Modal', { login: { site } });
						}}
					/>
				</View>
				{wpUsers.map((wpUser) => (
					<WpUser key={wpUser.localId} wpUser={wpUser} site={site} />
				))}
			</>
		);
	}, [active, navigation, site, wpUsers]);

	return (
		<Styled.SiteWrapper>
			<Avatar src={`https://api.faviconkit.com/${site.url}/144`} />
			<Styled.SiteTextWrapper>
				<Text weight="bold">{name || site.url}</Text>
				<Text size="small" type="secondary">
					{site.url}
				</Text>
				<Styled.SiteStatusWrapper>
					{renderActiveIcon}
					{renderStatus}
				</Styled.SiteStatusWrapper>
				{renderWpUsers}
			</Styled.SiteTextWrapper>
			<Icon
				name="remove"
				size="large"
				type="critical"
				onPress={showConfirmDialog}
				backgroundStyle="none"
			/>
			{visible && <Modal site={site} user={user} visible={visible} setVisible={setVisible} />}
			{openConfirmDialog && (
				<Dialog
					open
					title="Remove site"
					onClose={hideConfirmDialog}
					primaryAction={{ label: 'Delete', action: handleRemoveSite, type: 'critical' }}
					secondaryActions={[{ label: 'Cancel', action: hideConfirmDialog }]}
				>
					<Dialog.Section>
						<Text>Delete site</Text>
					</Dialog.Section>
				</Dialog>
			)}
		</Styled.SiteWrapper>
	);
};

export default Site;
