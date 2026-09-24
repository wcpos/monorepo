import * as React from 'react';
import { Pressable } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { useWcposAuth } from '../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../hooks/use-login-handler';

const authLogger = getLogger(['wcpos', 'auth', 'user']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
	hasExistingUsers: boolean;
	compact?: boolean;
}

export function AddUserButton({ site, hasExistingUsers, compact = false }: Props) {
	const { handleLoginSuccess, isProcessing } = useLoginHandler(site);
	const processedResponseRef = React.useRef<string | null>(null);
	const t = useT();

	const { isReady, response, promptAsync } = useWcposAuth({
		site: {
			wcpos_login_url: site.wcpos_login_url ?? '',
			name: site.name ?? '',
		},
		// Redirect-return results for "add a user" must never be claimed by a
		// WpUser re-auth row (which adopts the returned token for active requests).
		claimKey: 'add-user',
	});

	React.useEffect(() => {
		if (!response) return;

		const responseKey = response.params?.access_token || response.error || response.type;
		if (processedResponseRef.current === responseKey) {
			return;
		}

		if (response.type === 'success') {
			if (!response.params) {
				authLogger.error('Login succeeded without credentials', {
					code: ERROR_CODES.AUTH_UNEXPECTED,
					showToast: true,
					context: { siteName: site.name, response },
				});
				return;
			}
			authLogger.debug(`Login successful for site: ${site.name}`);
			processedResponseRef.current = responseKey;
			void handleLoginSuccess({ params: response.params });
		} else if (response.type === 'error') {
			authLogger.error(`Login failed: ${response.error}`, {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				showToast: true,
				context: {
					siteName: site.name,
					response,
				},
			});
			processedResponseRef.current = responseKey;
		}
	}, [response, handleLoginSuccess, site.name]);

	const disabled = !isReady || isProcessing;

	const handlePress = React.useCallback(() => {
		// Clear the dedupe key so that a retry of the same login attempt (which
		// may surface the same error / token) is not silently swallowed by the
		// guard in the effect above.
		processedResponseRef.current = null;
		void promptAsync();
	}, [promptAsync]);

	return (
		<Pressable
			testID={compact ? 'user-sheet-another-account' : 'add-user-button'}
			disabled={disabled}
			onPress={handlePress}
			className={
				compact
					? 'active:bg-muted h-11 justify-center px-4'
					: disabled
						? 'border-border min-h-row w-full flex-row items-center gap-3 rounded-lg border border-dashed px-3 py-2 opacity-60'
						: 'border-border active:bg-muted min-h-row w-full flex-row items-center gap-3 rounded-lg border border-dashed px-3 py-2'
			}
		>
			{!compact && <Icon name="plus" size="sm" />}
			<Text className="text-muted-foreground text-sm font-medium">
				{isProcessing
					? t('common.loading')
					: compact
						? t('register.another_account')
						: hasExistingUsers
							? t('auth.add_another_user', { _tags: 'core' })
							: t('auth.sign_in_with_wordpress', { _tags: 'core' })}
			</Text>
		</Pressable>
	);
}
