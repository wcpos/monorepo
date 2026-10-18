import * as React from 'react';
import { Platform, type ViewProps } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { type ReadonlySiteRecord } from '@wcpos/query/user-db';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { credentialsListResource } from '../../../hooks/user-db-list-resources';
import { AddUserButton } from './add-user-button';
import { useSiteSelection } from './site-selection';
import { StoreSelect } from './store-select';
import { WpUser } from './wp-user';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

const authLogger = getLogger(['wcpos', 'auth', 'login']);

const ARROW_STEP: Record<string, 1 | -1> = {
	ArrowDown: 1,
	ArrowRight: 1,
	ArrowUp: -1,
	ArrowLeft: -1,
};

/**
 * The ARIA radio-group keys (web): an arrow on a user's radio moves to the previous or next
 * user, wrapping, and selects it. Only the selected radio is a tab stop (`WpUser`), so Tab
 * enters and leaves the group in one step. The next radio is focused and then clicked, the
 * same press a pointer makes, so selection keeps one path; arrows on a row's own buttons
 * (× and Re-authenticate) are left alone.
 */
const onUsersKeyDown: NonNullable<ViewProps['onKeyDown']> = (event) => {
	const step = ARROW_STEP[event.nativeEvent.key];
	const target = event.target as unknown as HTMLElement;
	if (!step || target.getAttribute('role') !== 'radio') return;
	const group = event.currentTarget as unknown as HTMLElement;
	const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
	const index = radios.indexOf(target);
	if (index === -1) return;
	event.preventDefault();
	const next = radios[(index + step + radios.length) % radios.length];
	next.focus();
	next.click();
};

interface WpUsersProps {
	site: ReadonlySiteRecord;
}

export function WPUsers({ site }: WpUsersProps) {
	const wpCreds = useObservableSuspense(credentialsListResource(site));
	const t = useT();
	const { login } = useAppState();
	// Explicit user/store choice (null until picked), held above the accordion so
	// it survives a fold. The effective selection is derived during render so we
	// never need an effect to sync it.
	const [{ pickedUserUuid, selectedStoreId }, updateSelection] = useSiteSelection(site.uuid ?? '');

	// Derive the selected user: the explicit pick if it still exists, otherwise
	// fall back to the first available credential.
	const selectedUser =
		(pickedUserUuid ? wpCreds.find((c) => c.uuid === pickedUserUuid) : undefined) ?? wpCreds[0];
	const selectedUserUuid = selectedUser?.uuid ?? null;

	return (
		<VStack space="md">
			{/* Users Section */}
			<VStack space="sm">
				<Text className="text-sm font-semibold">
					{t('auth.wordpress_users_heading', { _tags: 'core' })}
				</Text>

				<VStack space="sm">
					{/* The rows are radios; the group holds only them, so Add user stays outside it. */}
					{wpCreds.length > 0 && (
						<VStack
							space="sm"
							role="radiogroup"
							aria-label={t('auth.wordpress_users_heading', { _tags: 'core' })}
							onKeyDown={Platform.OS === 'web' ? onUsersKeyDown : undefined}
						>
							{wpCreds.map((wpCred) => (
								<ErrorBoundary key={wpCred.uuid}>
									<Suspense>
										<WpUser
											wpUser={wpCred}
											site={site}
											isSelected={selectedUserUuid === wpCred.uuid}
											onSelect={() => {
												// Changing user resets the store choice.
												updateSelection(() => ({
													pickedUserUuid: wpCred.uuid ?? null,
													selectedStoreId: null,
												}));
											}}
										/>
									</Suspense>
								</ErrorBoundary>
							))}
						</VStack>
					)}
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
							onStoreSelect={(storeId) =>
								updateSelection((current) => ({ ...current, selectedStoreId: storeId }))
							}
							onLogin={(storeID) => {
								// uuid is the primary key on both documents — always set on a stored row.
								login({
									siteID: site.uuid!,
									wpCredentialsID: selectedUser.uuid!,
									storeID,
								}).catch((error) => {
									// A rejected login leaves the cashier on the store picker with no
									// feedback; at minimum it must reach the log pipeline.
									authLogger.error('Store login failed', {
										code: ERROR_CODES.AUTH_UNEXPECTED,
										context: { siteName: site.name, storeID, error },
									});
								});
							}}
						/>
					</Suspense>
				</ErrorBoundary>
			)}
		</VStack>
	);
}
