import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';

import type { ReceiptMode } from './hooks/use-receipt-data';

interface ReceiptModeBadgeProps {
	mode: ReceiptMode;
}

/**
 * Displays a labeled badge indicating the receipt mode:
 * - Fiscal: "Fiscal receipt" with invoice icon
 * - Live: "Updated copy" with refresh icon
 */
export function ReceiptModeBadge({ mode }: ReceiptModeBadgeProps) {
	const t = useT();

	const isFiscal = mode === 'fiscal';

	return (
		<View
			className={`self-center rounded-full px-3 py-1 ${isFiscal ? 'bg-primary/10' : 'bg-muted'}`}
		>
			<HStack className="items-center gap-1.5">
				<Icon
					name={isFiscal ? 'fileInvoiceDollar' : 'arrowRotateRight'}
					size="xs"
					variant={isFiscal ? 'primary' : 'muted'}
				/>
				<Text
					className={`text-xs font-medium ${isFiscal ? 'text-primary' : 'text-muted-foreground'}`}
				>
					{isFiscal
						? t('receipt.fiscal_receipt', 'Fiscal receipt')
						: t('receipt.updated_copy', 'Updated copy')}
				</Text>
			</HStack>
		</View>
	);
}
