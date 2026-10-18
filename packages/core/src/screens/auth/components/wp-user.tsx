import * as React from 'react';

import { removeCredentials } from '@wcpos/query/user-db';
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
import { Avatar, getInitials } from '@wcpos/components/avatar';
import { Button, ButtonText } from '@wcpos/components/button';
import { ListItem } from '@wcpos/components/list-item';
import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';
import { StatusBadge } from '@wcpos/components/status-badge';
import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useLoginHandler } from '../hooks/use-login-handler';
import { useT } from '../../../contexts/translations';
import { useUserValidation } from '../../../hooks/use-user-validation';
import { useWcposAuth } from '../../../hooks/use-wcpos-auth';

const authLogger = getLogger(['wcpos', 'auth', 'user']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
	isSelected: boolean;
	onSelect: () => void;
}

export function WpUser({ site, wpUser, isSelected, onSelect }: Props) {
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { isValid, isLoading } = useUserValidation({ site, wpUser });
	const { handleLoginSuccess } = useLoginHandler(site);
	const processedResponseRef = React.useRef<string | null>(null);
	const { response, promptAsync } = useWcposAuth({
		site: {
			wcpos_login_url: site.wcpos_login_url ?? '',
			name: site.name ?? '',
		},
		// Redirect-return results are claimed per initiating consumer: this row's
		// re-auth must not swallow an add-user login (or another row's re-auth).
		claimKey: `reauth:${wpUser.uuid}`,
	});

	const displayName = wpUser.display_name || t('auth.unknown_user');
	const initials = getInitials(displayName);
	const showReauth = !isLoading && !isValid;
	const roleLabel = React.useMemo(() => {
		const roles = (wpUser as unknown as { roles?: string[] }).roles;
		if (!Array.isArray(roles) || roles.length === 0) return undefined;
		const humanize = (slug: string) =>
			slug
				.split(/[_\-\s]+/)
				.filter(Boolean)
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ');
		return roles.map(humanize).join(', ');
	}, [wpUser]);

	// Handle re-authentication OAuth response
	React.useEffect(() => {
		if (!response) return;

		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) return;

		if (response.type === 'success') {
			if (!response.params) {
				authLogger.error('Re-authentication succeeded without credentials', {
					code: ERROR_CODES.AUTH_UNEXPECTED,
					showToast: true,
					context: { siteName: site.name, response },
				});
				return;
			}

			const params = response.params;
			processedResponseRef.current = responseKey;
			void (async () => {
				try {
					await handleLoginSuccess({ params });
					// Re-auth can be reached after a pre-flight auth-required block;
					// clear the flag so subsequent requests aren't rejected despite
					// the newly-saved tokens (mirrors auth-error-handler.ts:203).
					// Only adopt the token globally when the server authenticated THIS
					// row's user — the login page lets anyone sign in, and the refreshed
					// token overrides the selected user's token on every request.
					if (Number.parseInt(params.id, 10) === Number(wpUser.id)) {
						requestStateManager.setRefreshedToken(params.access_token);
						requestStateManager.setAuthFailed(false);
					} else {
						authLogger.warn(
							'Re-authentication returned a different user; credentials saved but token not adopted for active requests',
							{
								showToast: true,
								toast: { title: t('auth.signed_in_as_different_user', { _tags: 'core' }) },
								context: { expectedId: wpUser.id, returnedId: params.id },
							}
						);
					}
				} catch (error) {
					processedResponseRef.current = null;
					authLogger.error('Failed to finish re-authentication', {
						code: ERROR_CODES.AUTH_UNEXPECTED,
						showToast: true,
						context: { siteName: site.name, error },
					});
				}
			})();
		} else if (response.type === 'error') {
			authLogger.error(`Re-authentication failed: ${response.error}`, {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				showToast: true,
				context: { siteName: site.name, response },
			});
			processedResponseRef.current = responseKey;
		}
	}, [response, handleLoginSuccess, site.name, wpUser.id, t]);

	const handleRemoveWpUser = React.useCallback(async () => {
		await removeCredentials(site, wpUser.uuid);
	}, [wpUser, site]);

	const trailing = showReauth ? (
		<Button
			size="sm"
			variant="outline"
			onPress={(e) => {
				e.stopPropagation();
				void promptAsync();
			}}
		>
			<ButtonText>{t('auth.re_authenticate', { _tags: 'core' })}</ButtonText>
		</Button>
	) : null;

	return (
		<>
			{/*
			 * Two ListItems, so the row's buttons are not inside the radio. ARIA radios have
			 * presentational children (a × or Re-authenticate inside one can lose its name and
			 * role), and before this the row was a <button> holding buttons, which React flags
			 * on /connect. The OUTER item is the tile (surface, selected/warning, hover) with
			 * no onPress, so it is a plain <div> and no tab stop; it holds Re-authenticate and
			 * the × beside the radio. The INNER item is the radio (avatar, name, status): no
			 * surface of its own, and it takes the tile's left and vertical padding so the
			 * selectable area still runs to the tile's edge.
			 */}
			<ListItem
				testID="wp-user-row"
				className="py-0 pl-0"
				selected={isSelected}
				// ListItem gives explicit `variant` priority over `selected` styling,
				// so only apply the warning variant to unselected expired rows —
				// otherwise the currently-selected expired user loses its selected
				// highlight despite driving StoreSelect below.
				variant={isSelected ? 'selected' : showReauth ? 'warning' : 'default'}
				trailing={trailing}
				removable
				removeLabel={t('auth.remove_2', { name: displayName })}
				onRemove={() => setDeleteDialogOpened(true)}
			>
				<ListItem
					testID="wp-user-button"
					className="min-h-0 rounded-none border-0 bg-transparent py-2 pr-0 pl-3"
					// `aria-*`, not `accessibilityState`: react-native-web drops the latter.
					role="radio"
					aria-checked={isSelected}
					onPress={onSelect}
					// react-native-web presses on Space only for the button role (Enter works for
					// any role), so the radio takes Space here, without scrolling the page.
					onKeyDown={(event) => {
						if (
							event.nativeEvent.key === ' ' &&
							event.target === event.currentTarget &&
							!event.defaultPrevented
						) {
							event.preventDefault();
							onSelect();
						}
					}}
					leading={
						<Avatar
							source={wpUser.avatar_url ? { uri: wpUser.avatar_url } : undefined}
							fallback={initials}
							size="md"
						/>
					}
				>
					<Text className="text-base font-medium">{displayName}</Text>
					{roleLabel && <Text className="text-muted-foreground text-sm">{roleLabel}</Text>}
					{isLoading ? (
						<Loader size="xs" variant="muted" />
					) : (
						<StatusBadge
							className="self-start"
							label={isValid ? t('auth.signed_in') : t('auth.sign_in_again')}
							variant={isValid ? 'success' : 'warning'}
						/>
					)}
				</ListItem>
			</ListItem>

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('auth.remove_2', { name: wpUser.display_name })}</AlertDialogTitle>
						<AlertDialogDescription>{t('auth.are_you_sure_you_want_to')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleRemoveWpUser}>
							{t('auth.remove')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
