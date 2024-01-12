import * as React from 'react';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dialog from '@wcpos/components/src/dialog';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';

import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';

/**
 *
 */
function getUrlWithoutProtocol(url: string) {
	return url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
}

/**
 *
 */
export const Site = ({ user, site, idx }) => {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();

	/**
	 * Remove site
	 */
	const handleRemoveSite = React.useCallback(async () => {
		try {
			const latest = site.getLatest();
			await latest.remove();
			await user.incrementalUpdate({
				$pullAll: {
					sites: [latest.uuid],
				},
			});
		} catch (err) {
			throw err;
		}
	}, [site, user]);

	return (
		<>
			<Box
				horizontal
				padding="medium"
				space="medium"
				align="center"
				style={{ borderTopWidth: idx === 0 ? 0 : 1 }}
			>
				<Box>
					<Avatar source={`https://icon.horse/icon/${getUrlWithoutProtocol(site.url)}`} />
				</Box>
				<Box fill space="small">
					<Box space="xSmall">
						<Text weight="bold">{site.name}</Text>
						<Text size="small" type="secondary">
							{site.url}
						</Text>
					</Box>
					<Box>
						<ErrorBoundary>
							<Suspense>
								<WPUsers site={site} />
							</Suspense>
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
