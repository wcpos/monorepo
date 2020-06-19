import { useContext } from 'react';
import { useTheme } from 'styled-components/native';
import { ThemeContext } from './theme-provider';

const useDatabase = () => {
	const { switchTheme } = useContext(ThemeContext);
	const theme = useTheme();
	return { theme, switchTheme };
};

export default useDatabase;
