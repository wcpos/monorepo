import * as React from 'react';
import { TouchableWithoutFeedback } from 'react-native';
import * as Styled from './styles';

type Props = {
	children?: React.ReactNode;
	onPress?: () => void;
};

const Dimmer: React.FC<Props> = ({ children, onPress }) => {
	return (
		<TouchableWithoutFeedback onPress={onPress}>
			<Styled.Dimmer>{children}</Styled.Dimmer>
		</TouchableWithoutFeedback>
	);
};

export default Dimmer;
