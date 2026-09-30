import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { formatMetaDataValue } from '../../../../components/format-meta-data-value';
import { EditableField } from '../../../../components/editable-field';
import { useUpdateFeeLine } from '../../../hooks/use-update-fee-line';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
interface Props {
	uuid: string;
	item: FeeLine;
	type: 'line_items';
}

/** The v2 cart's fee name: the old cell without the edit icon (the strip's Edit owns it). */
export function FeeName({ row }: CellContext<Props, 'name'>) {
	const { item, uuid } = row.original;
	const { updateFeeLine } = useUpdateFeeLine();

	/**
	 * filter out the private meta data
	 */
	const metaData = React.useMemo(
		() =>
			(item.meta_data ?? []).filter((meta) => {
				if (meta.key) {
					return !meta.key.startsWith('_');
				}
				return true;
			}),
		[item.meta_data]
	);

	/**
	 *
	 */
	return (
		<VStack className="w-full">
			{/* No edit icon here: the line strip's Edit owns the dialog (Paul, 2026-09-29). */}
			<View className="w-full">
				<EditableField
					variant="ghost"
					bold={false}
					numberOfLines={2}
					value={item.name ?? undefined}
					onChangeText={(name) => updateFeeLine(uuid, { name })}
				/>
			</View>

			{metaData.length > 0 && (
				<VStack space="xs">
					{metaData.map((meta) => (
						// The product cell's meta layout: a key and a value on one wrapping line, not the
						// old cell's CSS grid (a v2 file carries no Uniwind allowlist entry).
						<HStack key={meta.id || meta.key} className="flex-wrap gap-0">
							{/* Same meta the line-item cell decodes next door — a fee's meta is
							    no less server-supplied than a product's. */}
							<Text className="text-muted-foreground text-xs" decodeHtml>{`${meta.key}: `}</Text>
							<Text className="text-xs" decodeHtml>
								{formatMetaDataValue(meta.value)}
							</Text>
						</HStack>
					))}
				</VStack>
			)}
		</VStack>
	);
}
