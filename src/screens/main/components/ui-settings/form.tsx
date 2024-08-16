import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
} from '@wcpos/tailwind/src/collapsible';
import { Form, FormField, FormSwitch } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import { useUISettings } from '../../contexts/ui-settings';

export const schema = z.object({
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
export const UISettingsForm = ({ uiSettings }) => {
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const { getUILabel } = useUISettings(uiSettings.prefix);
	const t = useT();
	const [openColumns, setOpenColumns] = React.useState({});

	const toggleColumn = (columnKey) => {
		setOpenColumns((prevState) => ({
			...prevState,
			[columnKey]: !prevState[columnKey],
		}));
	};

	/**
	 *
	 */
	const form = useForm<z.infer<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			columns: formData.columns,
		},
	});

	return (
		<Form {...form}>
			<Collapsible defaultOpen>
				<CollapsibleTrigger>
					<Text>{t('Columns', { _tags: 'core' })}</Text>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<VStack>
						{formData.columns.map((column, columnIndex) => (
							<VStack className="gap-0" key={column.key}>
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
							</VStack>
						))}
					</VStack>
				</CollapsibleContent>
			</Collapsible>
		</Form>
	);
};
