import * as React from 'react';

import type { ReadonlySiteRecord } from '@wcpos/query/user-db';
import { MenuRow } from '@wcpos/components/menu-row';
import { Icon } from '@wcpos/components/icon';
import { ListItem } from '@wcpos/components/list-item';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { useWcposAuth } from '../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../hooks/use-login-handler';

const authLogger = getLogger(['wcpos', 'auth', 'user']);

interface Props {
	site: Pick<ReadonlySiteRecord, 'uuid' | 'name' | 'wcpos_login_url'>;
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

	const label = isProcessing
		? t('common.loading')
		: compact
			? t('register.another_account')
			: hasExistingUsers
				? t('auth.add_another_user', { _tags: 'core' })
				: t('auth.sign_in_with_wordpress', { _tags: 'core' });
	// In the user sheet it is one of the sheet's quiet rows; on the connect screen, the
	// dashed add-another row under the users.
	return compact ? (
		<MenuRow
			testID="user-sheet-another-account"
			disabled={disabled}
			onPress={handlePress}
			label={label}
		/>
	) : (
		<ListItem
			testID="add-user-button"
			variant="dashed"
			className="w-full"
			disabled={disabled}
			onPress={handlePress}
			leading={<Icon name="plus" size="sm" />}
		>
			<Text className="text-muted-foreground text-sm font-medium">{label}</Text>
		</ListItem>
	);
}
