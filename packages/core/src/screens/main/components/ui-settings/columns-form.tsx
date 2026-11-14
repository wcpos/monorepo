import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { DragHandle, type ReorderResult, SortableList } from '@wcpos/components/dnd';
import { FormField, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { SectionHeading } from '@wcpos/components/section-heading';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';

export const columnsFormSchema = z.object({
	columns: z.array(
		z.object({
			key: z.string().readonly(),
			show: z.boolean(),
			display: z
				.array(
					z.object({
						key: z.string().readonly(),
						show: z.boolean(),
					})
				)
				.optional(),
		})
	),
});

type ColumnsFormValues = z.infer<typeof columnsFormSchema>;
type ColumnField = ColumnsFormValues['columns'][number] & { id: string };

interface UISettingsColumnsFormProps {
	getUILabel: (key: string) => string;
}

/**
 *
 */
export function UISettingsColumnsForm({ getUILabel }: UISettingsColumnsFormProps) {
	const t = useT();
	const form = useFormContext();

	const { fields: rawFields, move } = useFieldArray({
		control: form.control,
		name: 'columns',
	});
	const fields = rawFields as unknown as ColumnField[];

	/**
	 * Handle reorder from SortableList
	 * Note: useFieldArray's `move()` handles the form state update.
	 * The form's watch subscription (via useFormChangeHandler) will trigger the save.
	 */
	const handleOrderChange = React.useCallback(
		({ fromIndex, toIndex }: ReorderResult<ColumnField>) => {
			if (fromIndex !== toIndex) {
				move(fromIndex, toIndex);
			}
		},
		[move]
	);

	/**
	 * Render a single column item (shared between SortableList and simple list)
	 */
	const renderColumnItem = (column: ColumnField, columnIndex: number) => (
		<VStack key={column.key} className="web:hover:shadow-md gap-0 rounded p-2 transition-shadow">
			<HStack>
				<DragHandle className="mr-2">
					<Icon name="dragHandleVertical" size="xs" className="cursor-grab" />
				</DragHandle>
				<FormField
					control={form.control}
					name={`columns.${columnIndex}.show`}
					render={({ field }) => <FormSwitch label={getUILabel(column.key)} {...field} />}
				/>
			</HStack>
			{column.display && (
				<ColumnDisplayOptions
					columnIndex={columnIndex}
					display={column.display}
					getUILabel={getUILabel}
				/>
			)}
		</VStack>
	);

	/**
	 *
	 */
	return (
		<VStack className="gap-0">
			<SectionHeading title={t('common.columns')} />
			<VStack className="gap-0">
				<SortableList
					listId="columns"
					items={fields}
					getItemId={(field) => field.key}
					onOrderChange={handleOrderChange}
					renderItem={renderColumnItem}
				/>
			</VStack>
		</VStack>
	);
}

/**
 * A shown column's display switches, nested under its switch one gutter in (property rows rule 8:
 * conditional settings nest under their switch, never behind a fold). Hidden with the column.
 */
function ColumnDisplayOptions({
	columnIndex,
	display,
	getUILabel,
}: {
	columnIndex: number;
	display: { key: string; show: boolean }[];
	getUILabel: (key: string) => string;
}) {
	const form = useFormContext();
	const shown = useWatch({ control: form.control, name: `columns.${columnIndex}.show` });
	if (!shown) return null;

	return (
		<VStack className="gap-0 pt-2 pl-10">
			{display.map((displayItem, displayIndex) => (
				<FormField
					key={displayItem.key}
					control={form.control}
					name={`columns.${columnIndex}.display.${displayIndex}.show`}
					render={({ field }) => (
						<View className="p-2">
							<FormSwitch label={getUILabel(displayItem.key)} {...field} />
						</View>
					)}
				/>
			))}
		</VStack>
	);
}
