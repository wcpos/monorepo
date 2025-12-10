import * as React from 'react';
import { View } from 'react-native';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Pressable } from '@wcpos/components/pressable';
import { Text } from '@wcpos/components/text';
import { Textarea } from '@wcpos/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const CustomerNote = () => {
	const [isEditing, setIsEditing] = React.useState(false);
	const { currentOrder } = useCurrentOrder();
	const note = useObservableEagerState(currentOrder.customer_note$);
	const [value, setValue] = React.useState(note);
	const t = useT();
	const { localPatch } = useLocalMutation();

	// /**
	//  * Keep textarea value insync with the order.customer_note
	//  */
	React.useEffect(() => {
		setValue(note);
	}, [note]);

	/**
	 *
	 */
	const handleSaveNote = React.useCallback(() => {
		localPatch({
			document: currentOrder,
			data: { customer_note: value.replace(/^\s+|\s+$/g, '').trim() },
		});
		setIsEditing(false);
	}, [currentOrder, localPatch, value]);

	/**
	 *
	 */
	if (isEmpty(value)) {
		return null;
	}

	/**
	 *
	 */
	return (
		<HStack className="bg-footer border-border items-start border-y p-2">
			<Tooltip>
				<TooltipTrigger>
					<Icon name="messageLines" className="fill-secondary-foreground" />
				</TooltipTrigger>
				<TooltipContent>
					<Text>{t('Customer Note', { _tags: 'core' })}</Text>
				</TooltipContent>
			</Tooltip>
			<View className="flex-1">
				{isEditing ? (
					<Textarea
						value={value}
						onChangeText={setValue}
						autoFocus
						onBlur={handleSaveNote}
						onSubmitEditing={handleSaveNote}
						blurOnSubmit
					/>
				) : (
					<Pressable onPress={() => setIsEditing(true)}>
						<Text>{value}</Text>
					</Pressable>
				)}
			</View>
		</HStack>
	);
};
