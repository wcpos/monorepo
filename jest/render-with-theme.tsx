import * as React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components/native';
import getTheme from '@wcpos/common/src/themes';

function renderWithTheme(Component: React.ReactNode) {
	return render(<ThemeProvider theme={getTheme('default')}>{Component}</ThemeProvider>);
}

export default renderWithTheme;
