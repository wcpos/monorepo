import customRender from './custom-renderer';

// re-export everything
export * from 'react-native-testing-library';

// override render method
export { customRender as render };
