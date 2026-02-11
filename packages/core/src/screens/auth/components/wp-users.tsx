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
export function WPUsers({ site }: WpUserProps) {
	const wpCreds = useObservableSuspense(
		(
			site as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<
					import('@wcpos/database').WPCredentialsDocument[]
				>;
			}
		).populateResource('wp_credentials')
	);
	const t = useT();

	return (
		<VStack space="xs">
			<Text testID="logged-in-users-label" className="text-sm">
				{t('auth.logged_in_users')}:
			</Text>
			<HStack>
				{wpCreds.map((wpCred: import('@wcpos/database').WPCredentialsDocument) => (
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
}
