import * as React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useObservable, useObservableState } from 'observable-hooks';
import Avatar from '@wcpos/common/src/components/avatar';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Dialog from '@wcpos/common/src/components/dialog';
import Button from '@wcpos/common/src/components/button';
import Modal from './login-modal';
import WpUser from './wp-user';
import * as Styled from './styles';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

interface SiteProps {
	site: SiteDocument;
	user: UserDocument;
}

const Site = ({ site, user }: SiteProps) => {
	const [visible, setVisible] = React.useState(false);
	const [openConfirmDialog, setOpenConfirmDialog] = React.useState(false);
	const showConfirmDialog = React.useCallback(() => setOpenConfirmDialog(true), []);
	const hideConfirmDialog = React.useCallback(() => setOpenConfirmDialog(false), []);
	const wpCreds = useObservableState(site.getWpCredentials$(), []);
	const navigation = useNavigation();

	const handleRemoveSite = async () => {
		await user.removeSite(site);
	};

	/**
	 *
	 */
	const renderWpUsers = React.useMemo(() => {
		// if (!active) {
		// 	return null;
		// }

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
				{wpCreds.map((wpCred) => (
					<WpUser key={wpCred.localID} wpUser={wpCred} site={site} />
				))}
			</>
		);
	}, [navigation, site, wpCreds]);

	return (
		<Styled.SiteWrapper>
			<Avatar src={`https://api.faviconkit.com/${site.url}/144`} />
			<Styled.SiteTextWrapper>
				<Text weight="bold">{site.name}</Text>
				<Text size="small" type="secondary">
					{site.url}
				</Text>
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
