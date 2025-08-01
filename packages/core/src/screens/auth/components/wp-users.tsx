import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { WpUser } from './wp-user';
import { useT } from '../../../contexts/translations';
import { AddUserButton } from './add-user-button';

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
							<WpUser wpUser={wpCred} site={site} />
						</Suspense>
					</ErrorBoundary>
				))}
				<AddUserButton site={site} />
			</HStack>
		</VStack>
	);
};
