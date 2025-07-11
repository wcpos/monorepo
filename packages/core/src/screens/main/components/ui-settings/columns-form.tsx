import * as React from 'react';

import { useFieldArray, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { Collapsible, CollapsibleContent } from '@wcpos/components/collapsible';
import {
	DndProvider,
	DndProviderProps,
	Draggable,
	DraggableStack,
	DraggableStackProps,
} from '@wcpos/components/dnd';
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
	const activeIdRef = React.useRef(null);

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
	 *
	 */
	const handleFinalize: DndProviderProps['onFinalize'] = (event, { activeId }) => {
		activeIdRef.current = activeId;
	};

	/**
	 *
	 */
	const onStackOrderChange: DraggableStackProps['onOrderChange'] = (value) => {
		if (activeIdRef.current) {
			const currentOrder = fields.map((field) => field.key);
			const oldIndex = currentOrder.indexOf(activeIdRef.current);
			const newIndex = value.indexOf(activeIdRef.current);
			move(oldIndex, newIndex);
			form.setValue('columns', form.getValues().columns, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
		}
	};

	/**
	 *
	 */
	return (
		<VStack>
			<Text className="font-semibold">{t('Columns', { _tags: 'core' })}</Text>
			<VStack>
				<DndProvider onFinalize={handleFinalize}>
					<DraggableStack direction="column" gap={10} onOrderChange={onStackOrderChange}>
						{fields.map((column, columnIndex) => {
							return (
								<Draggable key={column.id} id={column.key}>
									<HStack>
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
								</Draggable>
							);
						})}
					</DraggableStack>
				</DndProvider>
			</VStack>
		</VStack>
	);
};
