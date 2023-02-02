import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import { VariationSelect } from './variation-select';
import { useVariations } from '../../../../../../contexts/variations/use-variations';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 * @NOTE - popover is in portal outside of VariationsProvider
 * An inline popover cannot overflow the parent FlashList
 * I could wrap VariationsSelect in VariationsProvider, but that seems messy
 */
export const VariableActions = ({ item: product }: Props) => {
	const [open, setOpen] = React.useState(false);
	const { data: variations } = useVariations();

	return (
		<Popover
			opened={open}
			onClose={() => {
				setOpen(false);
			}}
			withinPortal
			placement="right"
		>
			<Popover.Target>
				<Icon
					name="circleChevronRight"
					size="xLarge"
					type="success"
					onPress={() => {
						setOpen(true);
					}}
				/>
			</Popover.Target>
			<Popover.Content>
				<React.Suspense fallback={<Text>loading variations...</Text>}>
					<VariationSelect parent={product} variations={variations} />
				</React.Suspense>
			</Popover.Content>
		</Popover>
	);
};
