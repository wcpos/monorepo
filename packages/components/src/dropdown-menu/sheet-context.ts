import * as React from 'react';

export const SheetContext = React.createContext<{ close: () => void } | null>(null);
export const useMenuSheet = () => React.useContext(SheetContext);
