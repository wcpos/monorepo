import styled from 'styled-components/native';
import { Text } from '../text/styles';
import Pressable from '../pressable';
import Button from '../button';

export const Raw = styled.TextInput`
	max-height: 300px;
`;

export const Container = styled.View`
	position: relative;
	width: 100%;
`;

export const RawButtonContainer = styled.View`
	position: absolute;
	top: 0;
	right: 0;
`;
