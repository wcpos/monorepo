import { ScrollView, View } from 'react-native';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DocsLink } from '@wcpos/components/docs-link';
import { Text } from '@wcpos/components/text';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../../contexts/translations';

export function CapturedUnfinishedNotice({ finishingError }: { finishingError: string }) {
	const t = useT();
	return (
		<View testID="checkout-terminal-finishing-error" className="gap-4 p-4">
			<Text className="text-destructive">{t('pos_checkout.paid_but_order_not_finished')}</Text>
			<Collapsible>
				<CollapsibleTrigger
					testID="checkout-terminal-finishing-details-toggle"
					className="min-h-12 justify-center"
				>
					<Text>{t('settings.support_details')}</Text>
				</CollapsibleTrigger>
				<CollapsibleContent>
					{/* Diagnostics can run long; bound them so the help link and the pane's actions stay reachable. */}
					<ScrollView className="max-h-40" nestedScrollEnabled>
						<Text testID="checkout-terminal-finishing-details" selectable>
							{finishingError}
						</Text>
					</ScrollView>
				</CollapsibleContent>
			</Collapsible>
			<DocsLink
				testID="checkout-terminal-finishing-help"
				className="min-h-12"
				href={getErrorCodeDocURL(ERROR_CODES.PAYMENT_CAPTURED_ORDER_UNFINISHED)}
			>
				{t('settings.having_trouble')}
			</DocsLink>
		</View>
	);
}
