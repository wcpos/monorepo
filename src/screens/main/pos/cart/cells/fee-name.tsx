import * as React from 'react';

import { Box } from '@wcpos/tailwind/src/box';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/tailwind/src/dialog';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { EditFeeLine } from './edit-fee-line';
import { useT } from '../../../../../contexts/translations';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	column: import('@wcpos/tailwind/src/table').ColumnProps<FeeLine>;
}

/**
 *
 */
export const FeeName = ({ uuid, item }: Props) => {
	const { updateFeeLine } = useUpdateFeeLine();
	const [openEditDialog, setOpenEditDialog] = React.useState(false);
	const t = useT();

	/**
	 * filter out the private meta data
	 */
	const metaData = React.useMemo(
		() =>
			item.meta_data.filter((meta) => {
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
		<>
			<VStack className="w-full">
				<HStack>
					<Button
						variant="outline"
						//onChange={(name) => updateLineItem(uuid, { name })}
					>
						<ButtonText className="font-bold">{item.name}</ButtonText>
					</Button>
					<Tooltip delayDuration={150}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								className="rounded-full"
								onPress={() => setOpenEditDialog(true)}
							>
								<Icon name="ellipsisVertical" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<Text>{t('Edit {name}', { _tags: 'core', name: item.name })}</Text>
						</TooltipContent>
					</Tooltip>
				</HStack>

				{metaData.length > 0 && (
					<Box className="grid gap-1 grid-cols-2">
						{metaData.map((meta) => {
							return (
								<React.Fragment key={meta.id || meta.display_key || meta.key}>
									<Text className="text-sm">{`${meta.key}:`}</Text>
									<Text className="text-sm">{meta.value}</Text>
								</React.Fragment>
							);
						})}
					</Box>
				)}
			</VStack>

			<Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('Edit {name}', { _tags: 'core', name: item.name })}</DialogTitle>
					</DialogHeader>
					<EditFeeLine uuid={uuid} item={item} />
				</DialogContent>
			</Dialog>
		</>
	);
};
