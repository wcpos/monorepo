import * as React from 'react';

import get from 'lodash/get';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dialog from '@wcpos/components/src/dialog';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Icon from '@wcpos/components/src/icon';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';
import useHttpClient from '@wcpos/hooks/src/use-http-client';

import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';
import { useVersionCheck } from '../../../hooks/use-version-check';

interface Props {
	user: import('@wcpos/database').UserDocument;
	site: import('@wcpos/database').SiteDocument;
	idx: number;
}

/**
 *
 */
function getUrlWithoutProtocol(url: string) {
	return url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
}

/**
 *
 */
export const Site = ({ user, site, idx }: Props) => {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { wcposVersionPass } = useVersionCheck({ site });
	const http = useHttpClient();

	/**
	 * A bit of a hack to get the latest site info
	 */
	React.useEffect(() => {
		const fetchSiteInfo = async () => {
			const response = await http.get(site.wp_api_url, { params: { wcpos: 1 } });
			const data = get(response, 'data', {});
			site.incrementalPatch({
				wp_version: data?.wp_version,
				wc_version: data?.wc_version,
				wcpos_version: data?.wcpos_version,
				wcpos_pro_version: data?.wcpos_pro_version,
				license: data?.license || {},
			});
		};
		fetchSiteInfo();
	}, []);

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
					{wcposVersionPass ? (
						<Box>
							<ErrorBoundary>
								<Suspense>
									<WPUsers site={site} />
								</Suspense>
							</ErrorBoundary>
						</Box>
					) : (
						<Box horizontal space="small">
							<Icon name="triangleExclamation" type="critical" />
							<Text type="critical">{t('Please update your WooCommerce POS plugin')}</Text>
						</Box>
					)}
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
