import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

interface Props {
	label: string;
	Modal: React.ComponentType<any>;
}

/**
 *
 */
export const AddCartItemButton = ({ label, Modal }: Props) => {
	const [opened, setOpened] = React.useState(false);

	return (
		<>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>{label}</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={() => setOpened(true)} />
				</Box>
			</Box>
			{opened && <Modal onClose={() => setOpened(false)} />}
		</>
	);
};
