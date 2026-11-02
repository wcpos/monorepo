import * as React from 'react';

/**
 * The ink (text colour class) a parent provides to every Text and Icon below it. It lives in its own module,
 * not in ./index.tsx, so a test that mocks the text module (`jest.mock('@wcpos/components/text', …)`, which
 * most core screen tests do) still leaves a real context for the components under test to provide and read.
 */
export const TextClassContext = React.createContext<string | undefined>(undefined);
