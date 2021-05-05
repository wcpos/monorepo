import * as React from 'react';
import Icon from '../icon';
import * as Styled from './styles';

export interface NumpadProps {
	display?: 'below' | 'center' | 'bottom' | 'inline';
	placeholder?: string;
}

const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'];

export const Numpad = ({ display = 'below', placeholder = '0' }: NumpadProps) => {
	const [displayText, setDisplayText] = React.useState(placeholder);

	const handleKeyPress = (key: string) => {
		setDisplayText(displayText + key);
	};

	const handleBackspace = () => {
		setDisplayText(displayText);
	};

	return (
		<Styled.Container>
			<Styled.Display>
				<Styled.DisplayText>{displayText}</Styled.DisplayText>
				<Icon name="backspace" onPress={handleBackspace} />
			</Styled.Display>
			<Styled.Keys>
				{keys.map((key) => (
					<Styled.Key key={`button-${key}`} onPress={() => handleKeyPress(key)}>
						<Styled.KeyText>{key}</Styled.KeyText>
					</Styled.Key>
				))}
			</Styled.Keys>
		</Styled.Container>
	);
};
