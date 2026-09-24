import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@wcpos/components/accordion';
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
import { Card } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Notice } from '@wcpos/components/notice';
import { VStack } from '@wcpos/components/vstack';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import type { SiteDocument, UserDocument } from '@wcpos/database';
import { useDocField } from '@wcpos/query';

import { Site, SiteHeader } from './site';
import { getInitialAccordionState, getNextAccordionState } from './sites-expansion';
import { peekRedirectLoginUrl } from '../../../hooks/use-wcpos-auth/redirect-result';
import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
import { useVersionCheck } from '../../../hooks/use-version-check';

interface SitesProps {
	user: UserDocument;
}

export function Sites({ user }: SitesProps) {
	const t = useT();
	const sites = useObservableSuspense(
		(
			user as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<SiteDocument[]>;
			}
		).populateResource('sites')
	);

	const siteUuids = React.useMemo(() => sites?.map((site) => site.uuid ?? '') ?? [], [sites]);
	const [accordionState, setAccordionState] = React.useState(() => {
		// A web redirect-return login must land in an EXPANDED section — its
		// consumers are unmounted otherwise and the one-shot result would go
		// unclaimed. peek is idempotent and non-consuming, so a discarded render
		// is harmless. Resolves to null on native/electron and normal loads.
		const pendingLoginUrl = peekRedirectLoginUrl();
		const pendingSiteUuid = pendingLoginUrl
			? (sites?.find((site) => site.wcpos_login_url === pendingLoginUrl)?.uuid ?? undefined)
			: undefined;
		return getInitialAccordionState(siteUuids, pendingSiteUuid);
	});
	const nextAccordionState = getNextAccordionState(accordionState, siteUuids);

	if (nextAccordionState !== accordionState) {
		setAccordionState(nextAccordionState);
	}

	if (!sites || sites.length === 0) {
		return null;
	}

	// Single site: render directly without accordion
	if (sites.length === 1) {
		return (
			<Card className="w-full p-3" testID="logged-in-users-label">
				<ErrorBoundary>
					<Site user={user} site={sites[0]} />
				</ErrorBoundary>
			</Card>
		);
	}

	// Multiple sites: use accordion
	return (
		<VStack className="w-full gap-2" testID="logged-in-users-label">
			<Text className="text-sm font-semibold">
				{t('auth.your_sites_heading', { _tags: 'core' })}
			</Text>
			<Accordion
				className="gap-2"
				type="single"
				collapsible
				value={nextAccordionState.expandedSiteUuid}
				onValueChange={(value) =>
					setAccordionState((current) => ({ ...current, expandedSiteUuid: value ?? '' }))
				}
			>
				{sites.map((site) => (
					<ErrorBoundary key={site.uuid}>
						<AccordionSite user={user} site={site} />
					</ErrorBoundary>
				))}
			</Accordion>
		</VStack>
	);
}

/**
 * A single site rendered as an AccordionItem with:
 * - Chevron on the left (via AccordionTrigger default)
 * - Site header in the center
 * - Remove button on the right
 * - Each item has its own card
 */
function AccordionSite({ user, site }: { user: UserDocument; site: SiteDocument }) {
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

	const wpCredentials = useDocField(site, (value) => value.wp_credentials);
	const userCount = Array.isArray(wpCredentials) ? wpCredentials.length : 0;

	return (
		<>
			<Card className="w-full p-3">
				<AccordionItem value={site.uuid ?? ''} className="border-b-0">
					<HStack className="items-center gap-2">
						<AccordionTrigger
							headerClassName="flex-1"
							className="min-h-row gap-3 py-2"
							chevronPosition="left"
						>
							<View className="flex-1 flex-row items-center gap-3">
								<SiteHeader site={site} />
								{userCount > 0 && (
									<StatusBadge
										label={`${userCount} ${userCount === 1 ? t('auth.user', { _tags: 'core' }) : t('auth.users', { _tags: 'core' })}`}
										variant="info"
									/>
								)}
							</View>
						</AccordionTrigger>
						<IconButton
							name="xmark"
							size="lg"
							variant="destructive"
							onPress={() => setDeleteDialogOpened(true)}
						/>
					</HStack>
					<AccordionContent>
						<ErrorBoundary>
							<Suspense>
								<AccordionSiteContent site={site} />
							</Suspense>
						</ErrorBoundary>
					</AccordionContent>
				</AccordionItem>
			</Card>

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

/**
 * Content inside an accordion item — needs Suspense boundary above it
 */
function AccordionSiteContent({ site }: { site: SiteDocument }) {
	const { wcposVersionPass } = useVersionCheck({ site });
	const t = useT();

	useSiteInfo({ site });

	if (!wcposVersionPass) {
		return (
			<Notice
				tone="warn"
				title={t('auth.update_plugin_to_continue')}
				docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('AUTH331') }}
			/>
		);
	}

	return <WPUsers site={site} />;
}
