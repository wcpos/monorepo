import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@wcpos/components/accordian';
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
import { StatusBadge } from '@wcpos/components/status-badge';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import type { SiteDocument, UserDocument } from '@wcpos/database';

import { Site, SiteHeader } from './site';
import { WPUsers } from './wp-users';
import { useT } from '../../../contexts/translations';
import { useSiteInfo } from '../../../hooks/use-site-info';
import { useVersionCheck } from '../../../hooks/use-version-check';

interface SitesProps {
	user: UserDocument;
}

export function Sites({ user }: SitesProps) {
	const sites = useObservableSuspense(
		(
			user as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<SiteDocument[]>;
			}
		).populateResource('sites')
	);

	if (!sites || sites.length === 0) {
		return null;
	}

	// Single site: render directly without accordion
	if (sites.length === 1) {
		return (
			<Card className="w-full">
				<ErrorBoundary>
					<Site user={user} site={sites[0]} />
				</ErrorBoundary>
			</Card>
		);
	}

	// Multiple sites: use accordion
	return (
		<Card className="w-full">
			<Text className="text-muted-foreground px-4 pt-4 text-xs font-semibold tracking-wider uppercase">
				Your Sites
			</Text>
			<Accordion type="single" collapsible defaultValue={sites[0].uuid}>
				{sites.map((site, index) => (
					<ErrorBoundary key={site.uuid}>
						<AccordionSite user={user} site={site} isFirst={index === 0} />
					</ErrorBoundary>
				))}
			</Accordion>
		</Card>
	);
}

/**
 * A single site rendered as an AccordionItem with:
 * - Chevron on the left (via AccordionTrigger default)
 * - Site header in the center
 * - Remove button on the right
 * - Separator between items
 */
function AccordionSite({
	user,
	site,
	isFirst,
}: {
	user: UserDocument;
	site: SiteDocument;
	isFirst: boolean;
}) {
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

	const wpCredentials = useObservableEagerState(site.wp_credentials$!);
	const userCount = Array.isArray(wpCredentials) ? wpCredentials.length : 0;

	return (
		<>
			{!isFirst && <View className="border-border border-t" />}
			<AccordionItem value={site.uuid ?? ''} className="border-b-0 px-4">
				<HStack className="items-center gap-2">
					<AccordionTrigger headerClassName="flex-1" className="gap-3 py-3" chevronPosition="left">
						<View className="flex-1 flex-row items-center gap-3">
							<SiteHeader site={site} />
							{userCount > 0 && (
								<StatusBadge
									label={`${userCount} ${userCount === 1 ? 'user' : 'users'}`}
									variant="info"
								/>
							)}
						</View>
					</AccordionTrigger>
					<IconButton
						name="circleXmark"
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
			<HStack space="sm" className="items-center py-2">
				<Text className="text-warning">
					{t('common.please_update_your_woocommerce_pos_plugin')}
				</Text>
			</HStack>
		);
	}

	return <WPUsers site={site} />;
}
