import styled from 'styled-components/native';
import { Text } from '../text/styles';
import Pressable from '../pressable';
import Button from '../button';

export const Raw = styled.TextInput`
	background-color: ${({ theme }) => theme.colors.lightestGrey};
	border-color: ${({ theme }) => theme.colors.grey};
	border-radius: ${({ theme }) => theme.rounding.small};
	border-width: ${({ theme }) => theme.border.thinner};
	font-family: monospace;
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
