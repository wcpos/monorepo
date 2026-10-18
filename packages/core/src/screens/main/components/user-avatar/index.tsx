import * as React from 'react';

import { Avatar, type AvatarProps, getInitials } from '@wcpos/components/avatar';
import { withoutDefaultGravatar } from '@wcpos/components/avatar/gravatar';
import { Suspense } from '@wcpos/components/suspense';
import { useDocField } from '@wcpos/query';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useImageAttachment } from '../../hooks/use-image-attachment';

import type { ImageAttachmentSource } from '../../hooks/use-image-attachment/types';

type RecordAvatarProps = {
	/** The record the picture belongs to (a customer, or the cashier's credentials). */
	record: ImageAttachmentSource;
	avatarUrl: string | null | undefined;
	/** The name the caller shows beside the avatar; its initials are the fallback. */
	name: string | null | undefined;
	size?: AvatarProps['size'];
	recyclingKey?: string;
};

/**
 * The image attachment hook suspends while the picture loads (web), so it lives in its own
 * component behind a Suspense boundary that shows the initials meanwhile.
 */
function RecordAvatarImage({
	record,
	url,
	initials,
	size,
	recyclingKey,
}: Omit<RecordAvatarProps, 'avatarUrl' | 'name'> & { url: string; initials: string }) {
	const { uri } = useImageAttachment(record, url);
	// A failed fetch resolves to no uri: the Avatar then shows the initials.
	return (
		<Avatar
			source={uri ? { uri } : undefined}
			fallback={initials}
			size={size}
			recyclingKey={recyclingKey}
		/>
	);
}

/**
 * A person's avatar from a stored record: their picture, else their initials on the primary.
 * The Gravatar default is suppressed BEFORE the URL reaches the attachment hook, so the URL
 * fetched and cached (web Cache API, Electron's disk cache) is the `d=404` one and a missing
 * Gravatar fails into the initials instead of caching the silhouette.
 */
export function RecordAvatar({ record, avatarUrl, name, size, recyclingKey }: RecordAvatarProps) {
	const initials = getInitials(name);
	const url = withoutDefaultGravatar(avatarUrl) ?? '';
	return (
		<Suspense fallback={<Avatar fallback={initials} size={size} />}>
			<RecordAvatarImage
				record={record}
				url={url}
				initials={initials}
				size={size}
				recyclingKey={recyclingKey}
			/>
		</Suspense>
	);
}

/** The signed-in cashier's avatar (rail, bars). */
export function UserAvatar({
	wpCredentials,
	displayName,
}: {
	wpCredentials: WPCredentialsDocument;
	displayName?: string;
}) {
	const avatarUrl = useDocField(wpCredentials, (value) => value.avatar_url) as string | undefined;
	return <RecordAvatar record={wpCredentials} avatarUrl={avatarUrl} name={displayName} />;
}
