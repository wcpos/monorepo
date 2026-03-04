import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

import type { SubmissionStatus } from './hooks/use-receipt-data';

interface FiscalStatusProps {
	status: SubmissionStatus;
	onRetry?: () => void;
}

/**
 * Displays fiscal submission status on the receipt screen:
 * - sent: green checkmark, "Fiscal submission confirmed"
 * - pending: yellow spinner, "Fiscal submission pending"
 * - failed: red warning with retry button
 */
export function FiscalStatus({ status, onRetry }: FiscalStatusProps) {
	const t = useT();

	if (status === 'sent') {
		return (
			<View className="bg-success/10 rounded-md px-3 py-2">
				<HStack className="items-center gap-2">
					<Icon name="circleCheck" size="sm" variant="success" />
					<Text className="text-success text-sm font-medium">
						{t('receipt.fiscal_confirmed', 'Fiscal submission confirmed')}
					</Text>
				</HStack>
			</View>
		);
	}

	if (status === 'pending') {
		return (
			<View className="bg-warning/10 rounded-md px-3 py-2">
				<HStack className="items-center gap-2">
					<Icon name="clock" size="sm" variant="warning" loading />
					<Text className="text-warning text-sm font-medium">
						{t('receipt.fiscal_pending', 'Fiscal submission pending')}
					</Text>
				</HStack>
			</View>
		);
	}

	// failed
	return (
		<View className="bg-destructive/10 rounded-md px-3 py-2">
			<HStack className="items-center justify-between">
				<HStack className="items-center gap-2">
					<Icon name="triangleExclamation" size="sm" variant="destructive" />
					<Text className="text-destructive text-sm font-medium">
						{t('receipt.fiscal_failed', 'Fiscal submission failed')}
					</Text>
				</HStack>
				{onRetry && (
					<Button variant="destructive" size="sm" onPress={onRetry}>
						<Text>{t('common.retry', 'Retry')}</Text>
					</Button>
				)}
			</HStack>
		</View>
	);
}
