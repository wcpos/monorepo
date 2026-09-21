import * as React from 'react';

import { Avatar, getInitials } from '@wcpos/components/avatar';
import { Suspense } from '@wcpos/components/suspense';
import { useDocField } from '@wcpos/query';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useImageAttachment } from '../../hooks/use-image-attachment';

/**
 * The image attachment hook suspends while the avatar loads, so it lives in
 * its own component behind a Suspense boundary that falls back to initials.
 */
function UserAvatarImage({
	wpCredentials,
	displayName,
}: {
	wpCredentials: WPCredentialsDocument;
	displayName?: string;
}) {
	const avatarUrl = useDocField(wpCredentials, (value) => value.avatar_url);
	const { uri } = useImageAttachment(wpCredentials, avatarUrl as string);

	return <Avatar source={{ uri }} fallback={getInitials(displayName)} />;
}

export function UserAvatar({
	wpCredentials,
	displayName,
}: {
	wpCredentials: WPCredentialsDocument;
	displayName?: string;
}) {
	return (
		<Suspense fallback={<Avatar source={{ uri: undefined }} fallback={getInitials(displayName)} />}>
			<UserAvatarImage wpCredentials={wpCredentials} displayName={displayName} />
		</Suspense>
	);
}
