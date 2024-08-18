import * as React from 'react';

import * as z from 'zod';

import { Collapsible, CollapsibleContent } from '@wcpos/tailwind/src/collapsible';
import {
	DndProvider,
	Draggable,
	DraggableStack,
	DraggableStackProps,
} from '@wcpos/tailwind/src/dnd';
import { FormField, FormSwitch } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
export const UISettingsColumnsForm = ({ form, columns, getUILabel }) => {
	const t = useT();
	const [openColumns, setOpenColumns] = React.useState({});

	const toggleColumn = (columnKey) => {
		setOpenColumns((prevState) => ({
			...prevState,
			[columnKey]: !prevState[columnKey],
		}));
	};

	const onStackOrderChange: DraggableStackProps['onOrderChange'] = (value) => {
		console.log('onStackOrderChange', value);
	};
	const onStackOrderUpdate: DraggableStackProps['onOrderUpdate'] = (value) => {
		console.log('onStackOrderUpdate', value);
	};

	/**
	 *
	 */
	return (
		<VStack>
			<Text className="font-semibold">{t('Columns', { _tags: 'core' })}</Text>
			<VStack>
				<DndProvider>
					<DraggableStack
						direction="column"
						gap={10}
						onOrderChange={onStackOrderChange}
						onOrderUpdate={onStackOrderUpdate}
					>
						{columns.map((column, columnIndex) => (
							<Draggable key={column.key} id={column.key}>
								<HStack>
									<FormField
										control={form.control}
										name={`columns.${columnIndex}.show`}
										render={({ field }) => <FormSwitch label={getUILabel(column.key)} {...field} />}
									/>
									{column.display && (
										<Text
											onPress={() => toggleColumn(column.key)}
											variant="link"
											className="text-sm text-muted-foreground leading-none"
										>
											{t('Display Options', { _tags: 'core' })}
											<Icon
												name={openColumns[column.key] ? 'chevronUp' : 'chevronDown'}
												size="xs"
												className="ml-2 fill-muted-foreground"
											/>
										</Text>
									)}
								</HStack>
								{column.display && (
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
							</Draggable>
						))}
					</DraggableStack>
				</DndProvider>
			</VStack>
		</VStack>
	);
};
