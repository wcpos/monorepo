import * as React from 'react';

import { type ReadonlySiteRecord, type ReadonlyUserRecord, removeSite } from '@wcpos/query/user-db';
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
import { Avatar, getInitials } from '@wcpos/components/avatar';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Notice } from '@wcpos/components/notice';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
import { useAppInfo } from '../../../hooks/use-app-info';

interface Props {
	user: ReadonlyUserRecord;
	site: ReadonlySiteRecord;
}

function getUrlWithoutProtocol(url: string) {
	return url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
}

/**
 * Site header — avatar, name, URL
 */
export function SiteHeader({ site }: { site: Pick<ReadonlySiteRecord, 'name' | 'url'> }) {
	return (
		<HStack space="md" className="flex-1 items-center">
			<Avatar
				source={`https://icon.horse/icon/${getUrlWithoutProtocol(site.url ?? '')}`}
				fallback={getInitials(site.name ?? site.url ?? '')}
				size="md"
				shape="rounded"
				variant="muted"
			/>
			<VStack className="flex-1 gap-0.5">
				<Text className="text-base font-semibold">{site.name}</Text>
				<Text className="text-muted-foreground text-sm">{site.url}</Text>
			</VStack>
		</HStack>
	);
}

/**
 * Full site component — header + users/stores/login
 */
export function Site({ user, site }: Props) {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { compatibility } = useAppInfo({ site });
	const wcposVersionPass = compatibility?.wcposVersionPass ?? false;

	useSiteInfo({ site });

	const handleRemoveSite = React.useCallback(async () => {
		try {
			await removeSite(user, site.uuid);
		} catch (err) {
			throw err;
		}
	}, [site, user]);

	return (
		<>
			<VStack className="gap-3">
				{/* Site Header */}
				<HStack space="md" className="items-center">
					<SiteHeader site={site} />
					{/* Removing a site loses its users on this device: the last, red row of a ⋮ menu. */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton
								name="more"
								testID={`auth-site-menu-${site.uuid}`}
								accessibilityLabel={t('common.actions')}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								variant="destructive"
								testID={`auth-site-remove-${site.uuid}`}
								onPress={() => setDeleteDialogOpened(true)}
							>
								<Icon name="delete" className="fill-destructive" />
								<Text>{t('auth.remove_site')}</Text>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</HStack>

				{/* Site Content */}
				{wcposVersionPass ? (
					<ErrorBoundary>
						<Suspense>
							<WPUsers site={site} />
						</Suspense>
					</ErrorBoundary>
				) : (
					<Notice
						tone="warn"
						title={t('auth.update_plugin_to_continue')}
						docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('AUTH331') }}
					/>
				)}
			</VStack>

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('auth.remove_site')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('auth.remove_store_and_associated_users')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleRemoveSite}>
							{t('auth.remove')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
