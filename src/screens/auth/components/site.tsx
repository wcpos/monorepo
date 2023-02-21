import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { switchMap, tap } from 'rxjs/operators';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dialog from '@wcpos/components/src/dialog';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import WPUsersList from './wp-users-list';
import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';

type SiteDocument = import('@wcpos/database').SiteDocument;
type UserDocument = import('@wcpos/database').UserDocument;

interface SiteProps {
	site: SiteDocument;
	// user: UserDocument;
	first: boolean;
}

const Site = ({ site, first }: SiteProps) => {
	const { user } = useLocalData();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const wpUsersResource = React.useMemo(
		() => new ObservableResource(site.populate$('wp_credentials')),
		[site]
	);

	/**
	 * Remove site
	 */
	const handleRemoveSite = React.useCallback(async () => {
		try {
			await site.remove();
			await user.update({
				$pullAll: {
					sites: [site.uuid],
				},
			});
		} catch (err) {
			throw err;
		}
	}, [user, site]);

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
								<WPUsersList wpUsersResource={wpUsersResource} site={site} />
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
