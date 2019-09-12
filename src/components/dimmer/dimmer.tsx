import React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import { DimmerView } from './styles';

type Props = {
	children?: React.ReactNode;
	onPress?: () => void;
};

const Dimmer = ({ children, onPress }: Props) => {
	return (
		<TouchableWithoutFeedback onPress={onPress}>
			<DimmerView>{children}</DimmerView>
		</TouchableWithoutFeedback>
	);
};

export default Dimmer;
