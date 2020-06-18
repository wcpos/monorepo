import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components/native';
import { defaultTheme } from '../src/lib/theme';

function renderWithTheme(Component) {
	return render(<ThemeProvider theme={defaultTheme}>{Component}</ThemeProvider>);
}

export default renderWithTheme;
