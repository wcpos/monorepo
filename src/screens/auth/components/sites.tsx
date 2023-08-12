import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dialog from '@wcpos/components/src/dialog';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';

import { WPUsers } from './wp-users';
import { t } from '../../../lib/translations';

/**
 *
 */
function getUrlWithoutProtocol(url: string) {
	return url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
}

/**
 *
 */
export const Sites = ({ user }) => {
	const sites = useObservableSuspense(user.populateResource('sites'));
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

	/**
	 * Remove site
	 */
	const handleRemoveSite = React.useCallback(
		async (site) => {
			try {
				await site.remove();
				await user.incrementalUpdate({
					$pullAll: {
						sites: [site.uuid],
					},
				});
			} catch (err) {
				throw err;
			}
		},
		[user]
	);

	/**
	 *
	 */
	return (
		<>
			<Box
				raised
				rounding="medium"
				// padding="medium"
				// space="medium"
				style={{ width: '100%', backgroundColor: 'white' }}
			>
				{sites.map((site, index) => (
					<ErrorBoundary key={site.uuid}>
						<Box
							horizontal
							padding="medium"
							space="medium"
							align="center"
							style={{ borderTopWidth: index === 0 ? 0 : 1 }}
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
					</ErrorBoundary>
				))}
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
