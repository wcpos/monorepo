import React from 'react';
import { render } from '@testing-library/react';
import { defaultTheme } from '../src/lib/theme';
import { ThemeProvider } from 'styled-components/native';

function renderWithTheme(Component) {
	return render(<ThemeProvider theme={defaultTheme}>{Component}</ThemeProvider>);
}

export default renderWithTheme;
