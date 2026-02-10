import * as React from 'react';
import { View } from 'react-native';

import { useFieldArray, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { Collapsible, CollapsibleContent } from '@wcpos/components/collapsible';
import { DragHandle, type ReorderResult, SortableList } from '@wcpos/components/dnd';
import { FormField, FormSwitch } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
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
	columns: ColumnsFormValues['columns'];
	getUILabel: (key: string) => string;
}

/**
 *
 */
export function UISettingsColumnsForm({ columns, getUILabel }: UISettingsColumnsFormProps) {
	const t = useT();
	const [openColumns, setOpenColumns] = React.useState<Record<string, boolean>>({});
	const form = useFormContext();

	const toggleColumn = (columnKey: string) => {
		setOpenColumns((prevState) => ({
			...prevState,
			[columnKey]: !prevState[columnKey],
		}));
	};

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
		<VStack key={column.key} className="gap-0 rounded p-2 transition-shadow hover:shadow-md">
			<HStack>
				<DragHandle className="mr-2">
					<Icon name="gripLinesVertical" size="xs" className="cursor-grab" />
				</DragHandle>
				<FormField
					control={form.control}
					name={`columns.${columnIndex}.show`}
					render={({ field }) => <FormSwitch label={getUILabel(column.key)} {...field} />}
				/>
				{column.display && (
					<Text
						onPress={() => toggleColumn(column.key)}
						variant="link"
						className="text-muted-foreground text-sm leading-none"
					>
						{t('common.display_options')}
						<Icon
							name={openColumns[column.key] ? 'chevronUp' : 'chevronDown'}
							size="xs"
							className="fill-muted-foreground ml-2"
						/>
					</Text>
				)}
			</HStack>
			{column?.display && (
				<Collapsible open={openColumns[column.key]}>
					<CollapsibleContent>
						<VStack className="gap-0 pt-2 pl-10">
							{column.display.map(
								(displayItem: { key: string; show: boolean }, displayIndex: number) => (
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
								)
							)}
						</VStack>
					</CollapsibleContent>
				</Collapsible>
			)}
		</VStack>
	);

	/**
	 *
	 */
	return (
		<VStack className="gap-0">
			<Text className="font-semibold">{t('common.columns')}</Text>
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
