import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { HStack } from '@wcpos/components/src/hstack';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/src/tooltip';
import { VStack } from '@wcpos/components/src/vstack';

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
	const navigation = useNavigation();
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
							size="lg"
							onPress={() => navigation.navigate('Login', { siteID: site.uuid })}
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
