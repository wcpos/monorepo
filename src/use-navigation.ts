import { useContext } from 'react';
import { NavigationContext } from '@react-navigation/core';

export default function useNavigation() {
	return useContext(NavigationContext);
}
