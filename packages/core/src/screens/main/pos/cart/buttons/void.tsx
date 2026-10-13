import * as React from 'react';

import { Button } from '@wcpos/components/button';

import { useT } from '../../../../../contexts/translations';
import { useVoidOrder } from '../../hooks/use-void-order';

/**
 * The order sheet's Void button. The path is `useVoidOrder`'s; the cart column registers the same
 * path as the `void` surface, so this button registers nothing (roadmap#428, PR 1b).
 */
export function VoidButton({ onBeforeVoid }: { onBeforeVoid?: () => void } = {}) {
	const t = useT();
	const { voidOrder, storageDegraded } = useVoidOrder({ onBeforeVoid });

	/**
	 *
	 */
	return (
		<Button
			testID="void-button"
			size="lg"
			onPress={voidOrder}
			variant="destructive"
			className="flex-1 rounded-t-none rounded-br-none"
			disabled={storageDegraded}
		>
			{t('pos_cart.void')}
		</Button>
	);
}
