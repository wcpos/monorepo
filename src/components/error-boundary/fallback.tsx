import * as React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { View } from 'react-native';
import Icon from '../icon';
import Text from '../text';
import * as Styled from './styles';

/**
 * @TODO - convert this to a general removable message component
 */
const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => (
	<Styled.Container>
		<Styled.IconContainer>
			<Icon name="triangleExclamation" size="x-large" type="inverse" />
		</Styled.IconContainer>
		<Styled.TextContainer>
			<Text type="inverse" weight="bold">
				Something went wrong:
			</Text>
			<Text type="inverse">{error.message}</Text>
		</Styled.TextContainer>
		<Styled.RemoveContainer>
			<Icon onPress={resetErrorBoundary} name="xmark" type="inverse" />
		</Styled.RemoveContainer>
	</Styled.Container>
);

export default Fallback;
