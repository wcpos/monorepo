import * as React from 'react';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/tailwind/src/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/tailwind/src/tooltip';

import { EditButton } from './edit-button';
import { EditLineItemModal } from './edit-line-item';
import { useT } from '../../../../../contexts/translations';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const ProductName = ({ uuid, item, column }: Props) => {
	const { display } = column;
	const { updateLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 * filter out the private meta data
	 */
	const attributes = React.useMemo(
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
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill space="xSmall">
				<EdittableText weight="bold" onChange={(name) => updateLineItem(uuid, { name })}>
					{item.name}
				</EdittableText>
				{show('sku') && <Text size="small">{item.sku}</Text>}

				{attributes.map((meta) => {
					return (
						<Box space="xxSmall" key={meta.id || meta.display_key || meta.key} horizontal>
							<Text size="small" type="secondary">{`${meta.display_key || meta.key}:`}</Text>
							<Text size="small">{meta.display_value || meta.value}</Text>
						</Box>
					);
				})}
			</Box>
			<Box distribution="center">
				<Dialog>
					<DialogTrigger>
						<Tooltip delayDuration={150}>
							<TooltipTrigger>
								<Icon name="ellipsisVertical" />
							</TooltipTrigger>
							<TooltipContent>
								<Text>{t('Edit {name}', { _tags: 'core', name: item.name })}</Text>
							</TooltipContent>
						</Tooltip>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('Edit {name}', { _tags: 'core', name: item.name })}</DialogTitle>
						</DialogHeader>
						<EditLineItemModal uuid={uuid} item={item} />
					</DialogContent>
				</Dialog>
			</Box>
		</Box>
	);
};
