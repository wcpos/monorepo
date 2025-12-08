import * as React from 'react';

import { useFieldArray, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { Collapsible, CollapsibleContent } from '@wcpos/components/collapsible';
import { SortableList, type ReorderResult } from '@wcpos/components/dnd';
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

/**
 *
 */
export const UISettingsColumnsForm = ({ columns, getUILabel }) => {
	const t = useT();
	const [openColumns, setOpenColumns] = React.useState({});
	const form = useFormContext();

	const toggleColumn = (columnKey) => {
		setOpenColumns((prevState) => ({
			...prevState,
			[columnKey]: !prevState[columnKey],
		}));
	};

	const { fields, move } = useFieldArray({
		control: form.control,
		name: 'columns',
	});

	/**
	 * Handle reorder from SortableList
	 * Note: useFieldArray's `move()` handles the form state update.
	 * The form's watch subscription (via useFormChangeHandler) will trigger the save.
	 */
	const handleOrderChange = React.useCallback(
		({ fromIndex, toIndex }: ReorderResult<(typeof fields)[number]>) => {
			if (fromIndex !== toIndex) {
				move(fromIndex, toIndex);
			}
		},
		[move]
	);

	/**
	 * Render a single column item (shared between SortableList and simple list)
	 */
	const renderColumnItem = (column: (typeof fields)[number], columnIndex: number) => (
		<VStack key={column.key} className="rounded bg-white p-2 transition-shadow hover:shadow-md">
			<HStack>
				<Icon name="gripLinesVertical" size="xs" className="mr-2 cursor-grab" />
				<FormField
					control={form.control}
					name={`columns.${columnIndex}.show`}
					render={({ field }) => (
						<FormSwitch label={getUILabel(column.key)} {...field} />
					)}
				/>
				{column.display && (
					<Text
						onPress={() => toggleColumn(column.key)}
						variant="link"
						className="text-muted-foreground text-sm leading-none"
					>
						{t('Display Options', { _tags: 'core' })}
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
						<VStack className="pl-10 pt-2">
							{column.display.map((displayItem, displayIndex) => (
								<FormField
									key={displayItem.key}
									control={form.control}
									name={`columns.${columnIndex}.display.${displayIndex}.show`}
									render={({ field }) => (
										<FormSwitch label={getUILabel(displayItem.key)} {...field} />
									)}
								/>
							))}
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
		<VStack>
			<Text className="font-semibold">{t('Columns', { _tags: 'core' })}</Text>
			<VStack>
				<SortableList
					listId="columns"
					items={fields}
					getItemId={(field) => field.key}
					onOrderChange={handleOrderChange}
					gap={10}
					renderItem={renderColumnItem}
				/>
			</VStack>
		</VStack>
	);
};
