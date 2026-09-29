import * as React from 'react';
import { View } from 'react-native';

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
					value={item.name ?? undefined}
					onChangeText={(name) => updateFeeLine(uuid, { name })}
				/>
			</View>

			{metaData.length > 0 && (
				<View className="grid grid-cols-2 gap-1 p-2">
					{metaData.map((meta) => {
						return (
							<React.Fragment key={meta.id || meta.key}>
								{/* Same meta the line-item cell decodes next door — a fee's meta is
								    no less server-supplied than a product's. */}
								<Text className="text-sm" decodeHtml>{`${meta.key}:`}</Text>
								<Text className="text-sm" decodeHtml>
									{formatMetaDataValue(meta.value)}
								</Text>
							</React.Fragment>
						);
					})}
				</View>
			)}
		</VStack>
	);
}
