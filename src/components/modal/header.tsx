import * as React from 'react';
import Segment from '../segment';
import Icon from '../icon';
import Text from '../text';

export interface ModalHeaderProps {
	title: string;
	handleClose: () => void;
}

const ModalHeader = ({ title, handleClose }: ModalHeaderProps) => {
	return (
		<>
			<Segment grow>
				<Text size="large">{title}</Text>
			</Segment>
			<Segment>
				<Icon name="xmark" onPress={handleClose} />
			</Segment>
		</>
	);
};

export default ModalHeader;
