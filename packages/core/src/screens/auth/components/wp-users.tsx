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
	const [selectedUserUuid, setSelectedUserUuid] = React.useState<string | null>(null);
	const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null);

	// Auto-select first user if none selected
	React.useEffect(() => {
		if (wpCreds.length > 0 && !selectedUserUuid) {
			setSelectedUserUuid(wpCreds[0].uuid ?? null);
		}
		// If selected user was removed, reset
		if (selectedUserUuid && !wpCreds.find((c) => c.uuid === selectedUserUuid)) {
			setSelectedUserUuid(wpCreds.length > 0 ? (wpCreds[0].uuid ?? null) : null);
		}
	}, [wpCreds, selectedUserUuid]);

	const selectedUser = wpCreds.find((c) => c.uuid === selectedUserUuid);

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
