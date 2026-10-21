import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { Platform } from '@wcpos/utils/platform';

import { useT } from '../contexts/translations';
import { translateErrorAction } from '../screens/main/logs/generated/error-actions.generated';
import { translateErrorSummary } from '../screens/main/logs/generated/error-summaries.generated';

const CODE = 'SYNC341';

interface Props {
	/**
	 * Off web only (native, Electron), where there is no Reload: re-check the
	 * store. Never offered alongside Reload — one primary action.
	 */
	onRetry?: () => void;
	/** `center` for the full-screen gate, `start` inline on the login card. */
	align?: 'center' | 'start';
	testID?: string;
	/** Further actions, rendered in the same row after Reload (the screen's Logout). */
	children?: React.ReactNode;
}

/**
 * The server's protocol-gate refusal (wcpos_update_required, SYNC341): this app
 * is older than the store's WCPOS plugin requires, shown on the login card. It
 * reads the SYNC341 summary, action and docs link — one source for card, row
 * and docs page (the in-app gate is the GateScreen in screens/main/update-required).
 */
export function UpdateRequiredNotice({ onRetry, align = 'center', testID, children }: Props) {
	const t = useT();
	const centered = align === 'center';
	// Web: a reload picks up the updated bundle and clears the in-memory latch.
	const showReload = Platform.isWeb;
	const showRetry = !showReload && onRetry !== undefined;
	const hasActions = showReload || showRetry || React.Children.count(children) > 0;

	return (
		<VStack testID={testID} className={centered ? 'max-w-md items-center' : undefined}>
			<HStack className="items-center">
				<Icon name="warning" variant="destructive" />
				<Text className="text-destructive">{translateErrorSummary(t, CODE)}</Text>
			</HStack>
			<Text className={centered ? 'text-center' : undefined}>{translateErrorAction(t, CODE)}</Text>
			<DocsLink testID={`update-required-docs-link-${CODE}`} href={getErrorCodeDocURL(CODE)}>
				{t('common.learn_more', { _tags: 'core' })}
			</DocsLink>
			{hasActions ? (
				<HStack className={centered ? 'justify-center p-2' : undefined}>
					{showReload ? (
						<Button testID="update-required-reload" onPress={() => window.location.reload()}>
							<ButtonText>{t('common.reload', { _tags: 'core' })}</ButtonText>
						</Button>
					) : null}
					{showRetry ? (
						<Button testID="update-required-retry" variant="outline" onPress={onRetry}>
							<ButtonText>{t('common.retry')}</ButtonText>
						</Button>
					) : null}
					{children}
				</HStack>
			) : null}
		</VStack>
	);
}
