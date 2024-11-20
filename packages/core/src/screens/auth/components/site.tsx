import * as React from 'react';

import get from 'lodash/get';

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogAction,
} from '@wcpos/components/src/alert-dialog';
import { Avatar } from '@wcpos/components/src/avatar';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { IconButton } from '@wcpos/components/src/icon-button';
import { cn } from '@wcpos/components/src/lib/utils';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';
import { VStack } from '@wcpos/components/src/vstack';
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
			<HStack space="lg" className={cn('p-4', idx !== 0 && 'border-border border-t')}>
				<Avatar
					source={`https://icon.horse/icon/${getUrlWithoutProtocol(site.url)}`}
					className="w-10 h-10"
				/>
				<VStack className="flex-1">
					<VStack space="xs">
						<Text className="font-bold">{site.name}</Text>
						<Text className="text-sm">{site.url}</Text>
					</VStack>
					{wcposVersionPass ? (
						<ErrorBoundary>
							<Suspense>
								<WPUsers site={site} />
							</Suspense>
						</ErrorBoundary>
					) : (
						<HStack>
							<Icon name="triangleExclamation" className="fill-warning" />
							<Text className="text-warning">{t('Please update your WooCommerce POS plugin')}</Text>
						</HStack>
					)}
				</VStack>
				<Tooltip>
					<TooltipTrigger asChild>
						<IconButton
							name="circleXmark"
							size="lg"
							variant="destructive"
							onPress={() => setDeleteDialogOpened(true)}
						/>
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Remove site', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			</HStack>

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('Remove site', { _tags: 'core' })}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('Remove store and associated users?', { _tags: 'core' })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel', { _tags: 'core' })}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleRemoveSite}>
							{t('Remove', { _tags: 'core' })}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
