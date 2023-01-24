import * as React from 'react';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dialog from '@wcpos/components/src/dialog';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import UsersList from './users-list';
import { t } from '../../../lib/translations';

type SiteDocument = import('@wcpos/database').SiteDocument;
type UserDocument = import('@wcpos/database').UserDocument;

interface SiteProps {
	site: SiteDocument;
	user: UserDocument;
	first: boolean;
}

const Site = ({ site, user, first }: SiteProps) => {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

	/**
	 * Remove site
	 */
	const handleRemoveSite = React.useCallback(
		() =>
			user.removeSite(site).catch((err) => {
				console.error(err);
			}),
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
					<Avatar source={`https://icon.horse/icon/${site.getUrlWithoutProtocol()}`} />
				</Box>
				<Box fill space="medium">
					<Box>
						<Text weight="bold">{site.name}</Text>
						<Text size="small" type="secondary">
							{site.url}
						</Text>
					</Box>
					<Box>
						<ErrorBoundary>
							<React.Suspense>
								<UsersList site={site} />
							</React.Suspense>
						</ErrorBoundary>
					</Box>
				</Box>
				<Box>
					<Icon
						name="circleXmark"
						size="large"
						type="critical"
						onPress={() => setDeleteDialogOpened(true)}
					/>
				</Box>
			</Box>

			<Dialog
				opened={deleteDialogOpened}
				onAccept={handleRemoveSite}
				onClose={() => setDeleteDialogOpened(false)}
			>
				{t('Remove store and associated users?', { _tags: 'core' })}
			</Dialog>
		</>
	);
};

export default Site;
