import * as React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useObservable, useObservableState } from 'observable-hooks';
import Avatar from '@wcpos/components/src/avatar';
import Text from '@wcpos/components/src/text';
import Icon from '@wcpos/components/src/icon';
import Dialog, { useDialog } from '@wcpos/components/src/dialog';
import Button from '@wcpos/components/src/button';
import Segment from '@wcpos/components/src/segment';
import Box from '@wcpos/components/src/box';
import WpUsers from './wp-users';
import Login from './login';
import * as Styled from './styles';

type SiteDocument = import('@wcpos/database').SiteDocument;
type UserDocument = import('@wcpos/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

interface SiteProps {
	site: SiteDocument;
	user: UserDocument;
	first: boolean;
}

const Site = ({ site, user, first }: SiteProps) => {
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
			<Box
				horizontal
				padding="medium"
				space="medium"
				align="center"
				style={{ borderTopWidth: first ? 0 : 1 }}
			>
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
