import * as React from 'react';

import { router } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';

import WPUser from './wp-user';
import { useT } from '../../../contexts/translations';

interface WpUserProps {
	site: import('@wcpos/database').SiteDocument;
}

/**
 *
 */
export const WPUsers = ({ site }: WpUserProps) => {
	const wpCreds = useObservableSuspense(site.populateResource('wp_credentials'));
	const t = useT();

	return (
		<VStack space="xs">
			<Text className="text-sm">{t('Logged in users', { _tags: 'core' })}:</Text>
			<HStack>
				{wpCreds.map((wpCred) => (
					<ErrorBoundary key={wpCred.uuid}>
						<Suspense>
							<WPUser wpUser={wpCred} site={site} />
						</Suspense>
					</ErrorBoundary>
				))}
				<Tooltip>
					<TooltipTrigger asChild>
						<IconButton
							name="circlePlus"
							size="xl"
							onPress={() => router.push({ pathname: '/login', params: { siteID: site.uuid } })}
						/>
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Add new user', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
			</HStack>
		</VStack>
	);
};
