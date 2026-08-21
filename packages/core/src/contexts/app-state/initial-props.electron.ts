import type { InitialProps } from './initial-props.types';

/**
 * Electron: there is no embedded boot payload. Frozen empty object (not null)
 * mirrors the native default — hydration's `shouldExecute` checks
 * `initialProps?.site`.
 */
const initialProps: Readonly<InitialProps> = Object.freeze({});

export { initialProps };
