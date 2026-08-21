import type { InitialProps } from './initial-props.types';

/**
 * Native / default: there is no embedded boot payload. Frozen empty object
 * (not null) is load-bearing — hydration's `shouldExecute` checks
 * `initialProps?.site`, and existing callers rely on the object being present.
 */
const initialProps: Readonly<InitialProps> = Object.freeze({});

export { initialProps };
