import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

export function OptionChips({ attributes, fallback }: { attributes: unknown; fallback: string }) {
	const clean = sanitizeVariationAttributesRead(attributes) as { option: string }[] | undefined;
	const options = (clean ?? []).map((attribute) => attribute.option.trim()).filter(Boolean);
	return (
		<View className="flex-row flex-wrap gap-1">
			{(options.length > 0 ? options : [fallback]).map((option, index) => (
				<Text
					key={index}
					className="bg-foreground/12 rounded px-1.5 py-px text-xs font-bold"
					numberOfLines={1}
					decodeHtml
				>
					{option}
				</Text>
			))}
		</View>
	);
}
