import * as React from 'react';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Avatar } from '@wcpos/components/avatar';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { cn } from '@wcpos/components/lib/utils';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';

import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
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

	// Fetch and update site info
	useSiteInfo({ site });

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
					className="h-10 w-10"
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
							size="xl"
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
