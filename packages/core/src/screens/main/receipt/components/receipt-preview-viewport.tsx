import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import {
	DEFAULT_RECEIPT_PREVIEW_ZOOMS,
	getDefaultReceiptPreviewZoom,
} from './receipt-preview-viewport-utils';

export { DEFAULT_RECEIPT_PREVIEW_ZOOMS, getDefaultReceiptPreviewZoom };

interface ReceiptPreviewViewportProps {
	children: React.ReactNode;
	defaultZoom: number;
	zoomOptions?: readonly number[];
	label: string;
	testID?: string;
}

export function ReceiptPreviewViewport({
	children,
	defaultZoom: _defaultZoom,
	zoomOptions: _zoomOptions = DEFAULT_RECEIPT_PREVIEW_ZOOMS,
	label,
	testID,
}: ReceiptPreviewViewportProps) {
	// Native WebView scaling needs device validation, so native preview intentionally stays at 100%.
	const zoomOptions = [100] as const;
	const zoom = 100;

	return (
		<VStack testID={testID} className="min-h-0 flex-1 gap-2">
			<HStack accessibilityLabel={label} className="gap-2">
				<Text className="text-muted-foreground text-sm">{label}</Text>
				<HStack className="gap-1">
					{zoomOptions.map((option) => {
						const active = option === zoom;
						return (
							<View
								key={option}
								className={`rounded-md border px-2 py-1 ${active ? 'bg-primary' : 'bg-background'}`}
							>
								<Text
									className={active ? 'text-primary-foreground text-sm' : 'text-foreground text-sm'}
								>
									{option}%
								</Text>
							</View>
						);
					})}
				</HStack>
			</HStack>
			<ScrollView className="bg-muted min-h-0 flex-1 rounded-md border p-3">
				<View testID={testID ? `${testID}-canvas` : undefined}>{children}</View>
			</ScrollView>
		</VStack>
	);
}
