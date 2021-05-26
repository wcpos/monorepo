import styled from 'styled-components/native';
import Pressable from '../pressable';
import { Text } from '../text/styles';

export const Box = styled(Pressable)`
	flex-direction: row;
	align-items: center;
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ theme }) => theme.SEGMENT_BORDER_RADIUS};
	padding: ${({ theme }) => theme.SEGMENT_PADDING};
`;

export const InputText = styled(Text)``;

export const Container = styled.View``;

export const MessageContainer = styled.View``;

export const LabelContainer = styled.View``;
