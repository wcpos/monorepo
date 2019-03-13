import React from 'react';
import { render } from 'react-native-testing-library';
import { ThemeProvider } from 'styled-components/native';
import defaultTheme from '../lib/theme/themes/defaultTheme';

// const AllTheProviders = ({ children }: any) => {
//   return <ThemeProvider theme={defaultTheme}>{children}</ThemeProvider>;
// };

// const customRender = (ui: any, options?: any) =>
//   render(ui, { wrapper: AllTheProviders, ...options });

function customRender(node: any, options?: any) {
  const rendered: any = render(<ThemeProvider theme={defaultTheme}>{node}</ThemeProvider>, options);
  return {
    ...rendered,
    rerender: (ui: any, options: any) =>
      customRender(ui, { container: rendered.container, ...options }),
  };
}

export default customRender;
