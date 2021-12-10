import styled from 'styled-components/native';
import { StyleSheet } from 'react-native';

export const Container = styled.View`
	${{ ...StyleSheet.absoluteFillObject }}
	flex-direction: row;
	align-items: center;
	justify-content: center;
	z-index: ${({ theme }) => theme.MODAL_Z_INDEX};
`;
