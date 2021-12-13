import * as React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useObservable, useObservableState } from 'observable-hooks';
import Avatar from '@wcpos/common/src/components/avatar';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Dialog, { useDialog } from '@wcpos/common/src/components/dialog';
import Button from '@wcpos/common/src/components/button';
import Segment from '@wcpos/common/src/components/segment';
import Box from '@wcpos/common/src/components/box';
import WpUsers from './wp-users';
import Login from './login';
import * as Styled from './styles';

type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

interface SiteProps {
	site: SiteDocument;
	user: UserDocument;
}

const Site = ({ site, user }: SiteProps) => {
	const { ref: dialogRef, open: openConfirmDialog } = useDialog();

	/**
	 * Remove site
	 */
	const handleRemoveSite = React.useCallback(
		async (confirm: boolean) => {
			if (!confirm) return;
			await user.removeSite(site);
		},
		[user, site]
	);

	return (
		<>
			<Box horizontal space="medium" align="center">
				<Box>
					<Avatar src={`https://icon.horse/icon/${site.getUrlWithoutProtocol()}`} />
				</Box>
				<Box fill space="medium">
					<Box>
						<Text weight="bold">{site.name}</Text>
						<Text size="small" type="secondary">
							{site.url}
						</Text>
					</Box>
					<Box>
						<WpUsers site={site} />
					</Box>
				</Box>
				<Box>
					<Icon name="circleXmark" size="large" type="critical" onPress={openConfirmDialog} />
				</Box>
			</Box>

			<Dialog ref={dialogRef} onClose={handleRemoveSite}>
				Remove store and associated users?
			</Dialog>

			<Login site={site} />
		</>
	);
};

export default Site;
