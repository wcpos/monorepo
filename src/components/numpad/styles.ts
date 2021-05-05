import styled from 'styled-components/native';
import Pressable from '../pressable';
import { Text } from '../text/styles';

export const Container = styled.View``;

export const Display = styled.View`
	flex-direction: row;
`;

export const DisplayText = styled(Text)`
	flex: 1;
`;

export const Keys = styled.View`
	justify-content: space-between;
	flex-wrap: wrap;
	flex-direction: row;
`;

export const Key = styled(Pressable)`
	flex-grow: 1;
	flex-shrink: 0;
	flex-basis: 30%;
	align-items: center;
	margin: 1px;
`;

export const KeyText = styled(Text)``;
