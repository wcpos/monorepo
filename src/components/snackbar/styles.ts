import styled from 'styled-components/native';
import { StyleSheet } from 'react-native';
import { Text as StyledText } from '../text/styles';

export const View = styled.View`
	${{ ...StyleSheet.absoluteFillObject }}
`;

export const Container = styled.View`
	${{ ...StyleSheet.absoluteFillObject }}
	align-items: flex-end;
`;

export const Snackbar = styled.View`
	margin-horizontal: 5px;
	margin-vertical: 5px;
	background-color: ${({ theme }) => theme.SNACKBAR_BACKGROUND_COLOR};
	border-radius: ${({ theme }) => theme.SNACKBAR_RADIUS};
	padding: ${({ theme }) => `${theme.SNACKBAR_PADDING_Y} ${theme.SNACKBAR_PADDING_X}`};
	width: ${({ theme }) => theme.SNACKBAR_WIDTH};
	flex-direction: row;
	align-items: center;
`;

export const Text = styled(StyledText)`
	color: ${({ theme }) => theme.SNACKBAR_TEXT_COLOR};
	flex: 1;
`;
