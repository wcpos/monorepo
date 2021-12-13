import * as React from 'react';
import Box from '../box';
import Icon from '../icon';
import Text from '../text';

export interface ModalHeaderProps {
	title: string;
	handleClose: () => void;
}

const ModalHeader = ({ title, handleClose }: ModalHeaderProps) => {
	return (
		<Box horizontal padding="medium" space="medium" paddingBottom="none">
			<Box fill>
				<Text size="large">{title}</Text>
			</Box>
			<Box>
				<Icon name="xmark" onPress={handleClose} />
			</Box>
		</Box>
	);
};

export default ModalHeader;
