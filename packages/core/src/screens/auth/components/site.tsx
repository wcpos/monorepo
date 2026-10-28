import * as React from 'react';

import { type ReadonlySiteRecord, type ReadonlyUserRecord, removeSite } from '@wcpos/query/user-db';
import {
	AlertDialog,
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
import { clearUpdateRequired } from '@wcpos/utils/update-required-gate';

import { WPUsers } from './wp-users';
import { UpdateRequiredNotice } from '../../../components/update-required-notice';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
import { useAppInfo } from '../../../hooks/use-app-info';
import { useUpdateRequired } from '../../../hooks/use-update-required';

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
 * A site's content below its header — shared by the single-site card and the
 * multi-site accordion so both surfaces gate the same way. Precedence: plugin
 * too old (the older, cheaper check), then app too old (the server's
 * wcpos_update_required refusal), then the users list.
 */
export function SiteContent({ site }: { site: ReadonlySiteRecord }) {
	const t = useT();
	const { compatibility } = useAppInfo({ site });
	const wcposVersionPass = compatibility?.wcposVersionPass ?? false;

	useSiteInfo({ site });

	// The server's protocol-gate refusal, latched under wp_api_url by the login
	// validation or the sync engine (the same key the in-app gate reads).
	const wpApiUrl = site.wp_api_url;
	const updateRequired = useUpdateRequired(wpApiUrl);
	// Native/Electron have no Reload: clearing the latch remounts WPUsers, whose
	// validation re-runs and re-latches if the store still refuses this app.
	const handleRetryUpdateRequired = React.useCallback(() => {
		if (wpApiUrl) clearUpdateRequired(wpApiUrl);
	}, [wpApiUrl]);

	if (!wcposVersionPass) {
		return (
			<Notice
				tone="warning"
				title={t('auth.update_plugin_to_continue')}
				docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('AUTH331') }}
			/>
		);
	}

	if (updateRequired) {
		// No Logout (nobody is logged in) and no Add user (it cannot help):
		// one action — Reload on web, Try again elsewhere.
		return (
			<UpdateRequiredNotice
				testID="update-required-card-notice"
				align="start"
				onRetry={handleRetryUpdateRequired}
			/>
		);
	}

	return (
		<ErrorBoundary>
			<Suspense>
				<WPUsers site={site} />
			</Suspense>
		</ErrorBoundary>
	);
}

/**
 * Full site component — header + users/stores/login
 */
export function Site({ user, site }: Props) {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();

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

				<SiteContent site={site} />
			</VStack>

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('auth.remove_site')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('auth.remove_store_and_associated_users')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter
						cancel={true}
						confirm={{
							label: t('auth.remove'),
							destructive: true,
							onPress: () => void handleRemoveSite(),
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
