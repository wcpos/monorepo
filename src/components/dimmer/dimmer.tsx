import * as React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import * as Styled from './styles';

type IDimmerProps = {
	children?: React.ReactNode;
	onPress?: () => void;
};

const Dimmer = ({ children, onPress }: IDimmerProps) => {
	return (
		<TouchableWithoutFeedback onPress={onPress}>
			<Styled.Dimmer>{children}</Styled.Dimmer>
		</TouchableWithoutFeedback>
	);
};

export default Dimmer;
