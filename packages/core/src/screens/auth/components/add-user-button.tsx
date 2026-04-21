import React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useWcposAuth } from '../../../hooks/use-wcpos-auth';
import { useLoginHandler } from '../hooks/use-login-handler';

const authLogger = getLogger(['wcpos', 'auth', 'user']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
	hasExistingUsers: boolean;
}

export function AddUserButton({ site, hasExistingUsers }: Props) {
	const { handleLoginSuccess, isProcessing } = useLoginHandler(site);
	const processedResponseRef = React.useRef<string | null>(null);
	const t = useT();

	const { isReady, response, promptAsync } = useWcposAuth({
		site: {
			wcpos_login_url: site.wcpos_login_url ?? '',
			name: site.name ?? '',
		},
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
		promptAsync();
	}, [promptAsync]);

	return (
		<Pressable
			testID="add-user-button"
			disabled={disabled}
			onPress={handlePress}
			className={
				disabled
					? 'border-border web:cursor-not-allowed flex-row items-center gap-3 rounded-lg border border-dashed p-3 opacity-60'
					: 'border-border active:bg-primary/5 web:cursor-pointer web:transition-colors web:hover:border-primary/40 web:hover:bg-primary/5 flex-row items-center gap-3 rounded-lg border border-dashed p-3'
			}
		>
			<View className="bg-primary/10 h-9 w-9 items-center justify-center rounded-full">
				<Icon name="plus" size="sm" variant="primary" />
			</View>
			<Text className="text-muted-foreground text-sm font-medium">
				{isProcessing
					? t('common.loading')
					: hasExistingUsers
						? t('auth.add_another_user', { _tags: 'core' })
						: t('auth.sign_in_with_wordpress', { _tags: 'core' })}
			</Text>
		</Pressable>
	);
}
