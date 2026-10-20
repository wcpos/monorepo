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
import { Avatar, getInitials } from '@wcpos/components/avatar';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { clearUpdateRequired } from '@wcpos/utils/update-required-gate';

import { WPUsers } from './wp-users';
import { UpdateRequiredNotice } from '../../../components/update-required-notice';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
import { useUpdateRequired } from '../../../hooks/use-update-required';
import { useVersionCheck } from '../../../hooks/use-version-check';

interface Props {
	user: import('@wcpos/database').UserDocument;
	site: import('@wcpos/database').SiteDocument;
}

function getUrlWithoutProtocol(url: string) {
	return url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
}

/**
 * Site header — avatar, name, URL
 */
export function SiteHeader({ site }: { site: import('@wcpos/database').SiteDocument }) {
	return (
		<HStack space="md" className="flex-1 items-center">
			<Avatar
				source={`https://icon.horse/icon/${getUrlWithoutProtocol(site.url ?? '')}`}
				fallback={getInitials(site.name ?? site.url ?? '')}
				size="lg"
				shape="rounded"
				variant="muted"
			/>
			<VStack className="flex-1 gap-0.5">
				<Text className="leading-tight font-bold">{site.name}</Text>
				<Text className="text-muted-foreground text-xs leading-tight">{site.url}</Text>
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
export function SiteContent({ site }: { site: import('@wcpos/database').SiteDocument }) {
	const t = useT();
	const { wcposVersionPass } = useVersionCheck({ site });

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
			<HStack space="sm" className="items-center">
				<Icon name="triangleExclamation" className="fill-warning" />
				<Text className="text-warning">
					{t('common.please_update_your_woocommerce_pos_plugin')}
				</Text>
			</HStack>
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
			<VStack space="md" className="p-4">
				{/* Site Header */}
				<HStack space="md" className="items-center">
					<SiteHeader site={site} />
					<IconButton
						name="circleXmark"
						size="lg"
						variant="destructive"
						onPress={() => setDeleteDialogOpened(true)}
					/>
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
