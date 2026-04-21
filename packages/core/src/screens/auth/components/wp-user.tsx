import * as React from 'react';

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
import { StatusBadge } from '@wcpos/components/status-badge';
import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { getLogger } from '@wcpos/utils/logger';

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
	});

	const displayName = wpUser.display_name || 'Unknown User';
	const initials = getInitials(displayName);
	const avatarVariant = isValid ? 'success' : 'warning';
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
					// Re-auth can be reached after a pre-flight AUTH_REQUIRED block;
					// clear the flag so subsequent requests aren't rejected despite
					// the newly-saved tokens (mirrors auth-error-handler.ts:203).
					requestStateManager.setRefreshedToken(params.access_token);
					requestStateManager.setAuthFailed(false);
				} catch (error) {
					processedResponseRef.current = null;
					authLogger.error('Failed to finish re-authentication', {
						showToast: true,
						context: { siteName: site.name, error },
					});
				}
			})();
		} else if (response.type === 'error') {
			authLogger.error(`Re-authentication failed: ${response.error}`, {
				showToast: true,
				context: { siteName: site.name, response },
			});
			processedResponseRef.current = responseKey;
		}
	}, [response, handleLoginSuccess, site.name]);

	const handleRemoveWpUser = React.useCallback(async () => {
		await wpUser.incrementalRemove();
		await site.incrementalUpdate({
			$pullAll: {
				wp_credentials: [wpUser.uuid],
			},
		});
	}, [wpUser, site]);

	const trailing = isLoading ? (
		<Loader size="xs" variant="muted" />
	) : showReauth ? (
		<Button
			size="xs"
			variant="outline-warning"
			onPress={(e) => {
				e.stopPropagation();
				promptAsync();
			}}
		>
			<ButtonText>{t('auth.re_authenticate', { _tags: 'core' })}</ButtonText>
		</Button>
	) : (
		<StatusBadge
			label={
				isValid ? t('common.logged_in', { _tags: 'core' }) : t('common.expired', { _tags: 'core' })
			}
			variant={isValid ? 'success' : 'warning'}
		/>
	);

	return (
		<>
			<ListItem
				testID="wp-user-button"
				onPress={onSelect}
				selected={isSelected}
				// ListItem gives explicit `variant` priority over `selected` styling,
				// so only apply the warning variant to unselected expired rows —
				// otherwise the currently-selected expired user loses its selected
				// highlight despite driving StoreSelect below.
				variant={showReauth && !isSelected ? 'warning' : undefined}
				leading={
					<Avatar
						source={wpUser.avatar_url ? { uri: wpUser.avatar_url } : undefined}
						fallback={initials}
						variant={avatarVariant}
						size="md"
					/>
				}
				title={displayName}
				subtitle={roleLabel}
				trailing={trailing}
				removable
				onRemove={() => setDeleteDialogOpened(true)}
			/>

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('auth.remove_2', { name: wpUser.display_name })}</AlertDialogTitle>
						<AlertDialogDescription>{t('auth.are_you_sure_you_want_to')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction onPress={handleRemoveWpUser}>{t('auth.remove')}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
