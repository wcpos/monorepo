import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePOSOverlaySide } from '../contexts/overlay-side';
import { countVariance, varianceText } from './register-count.helpers';

export type ClosureCount = { counted: string; expected: string; blind: boolean };
export function ClosureSheet({
	counted,
	expected,
	blind,
	onDone,
}: ClosureCount & { onDone: () => void }) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const side = usePOSOverlaySide();
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onDone();
			}}
		>
			<DialogContent side={side} portalHost="pos" testID="closure-sheet">
				<View className="bg-success/10 h-10 w-10 items-center justify-center rounded-full">
					<Icon name="check" className="text-success" />
				</View>
				<DialogTitle>{t('register.closure_written')}</DialogTitle>
				<Text testID="closure-counted" className="min-h-11 text-[32px] tabular-nums">
					{t('register.counted')} · {format(Number(counted))}
				</Text>
				{!blind && (
					<>
						<Text testID="closure-expected" className="min-h-11 tabular-nums">
							{t('register.expected_line', { amount: format(Number(expected)) })}
						</Text>
						<Text testID="closure-variance" className="min-h-11 tabular-nums">
							{t('register.variance')} · {varianceText(countVariance(counted, expected), format, t)}
						</Text>
					</>
				)}
				<Button testID="closure-done" className="min-h-14" onPress={onDone}>
					{t('register.done')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
