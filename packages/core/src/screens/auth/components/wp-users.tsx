import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { WPCredentialsDocument } from '@wcpos/database';

import { AddUserButton } from './add-user-button';
import { StoreSelect } from './store-select';
import { WpUser } from './wp-user';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

interface WpUsersProps {
	site: import('@wcpos/database').SiteDocument;
}

export function WPUsers({ site }: WpUsersProps) {
	const wpCreds = useObservableSuspense(
		(
			site as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<WPCredentialsDocument[]>;
			}
		).populateResource('wp_credentials')
	);
	const t = useT();
	const { login } = useAppState();
	// Explicit user choice (null until the user picks one). The effective
	// selection is derived during render so we never need an effect to sync it.
	const [pickedUserUuid, setPickedUserUuid] = React.useState<string | null>(null);
	const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null);

	// Derive the selected user: the explicit pick if it still exists, otherwise
	// fall back to the first available credential.
	const selectedUser =
		(pickedUserUuid ? wpCreds.find((c) => c.uuid === pickedUserUuid) : undefined) ?? wpCreds[0];
	const selectedUserUuid = selectedUser?.uuid ?? null;

	const setSelectedUserUuid = setPickedUserUuid;

	return (
		<VStack space="md">
			{/* Users Section */}
			<VStack space="sm">
				<Text className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
					{t('auth.wordpress_users', { _tags: 'core' })}
				</Text>

				<VStack space="sm">
					{wpCreds.map((wpCred) => (
						<ErrorBoundary key={wpCred.uuid}>
							<Suspense>
								<WpUser
									wpUser={wpCred}
									site={site}
									isSelected={selectedUserUuid === wpCred.uuid}
									onSelect={() => {
										setSelectedUserUuid(wpCred.uuid ?? null);
										setSelectedStoreId(null);
									}}
								/>
							</Suspense>
						</ErrorBoundary>
					))}
					<AddUserButton site={site} hasExistingUsers={wpCreds.length > 0} />
				</VStack>
			</VStack>

			{/* Store Selection + Login */}
			{selectedUser && (
				<ErrorBoundary>
					<Suspense>
						<StoreSelect
							site={site}
							wpUser={selectedUser}
							selectedStoreId={selectedStoreId}
							onStoreSelect={setSelectedStoreId}
							onLogin={(storeID) => {
								login({
									siteID: site.uuid,
									wpCredentialsID: selectedUser.uuid,
									storeID,
								});
							}}
						/>
					</Suspense>
				</ErrorBoundary>
			)}
		</VStack>
	);
}
