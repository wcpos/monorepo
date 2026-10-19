// One dynamic root for every non-POS screen: modules shared between these screens
// stay in this chunk instead of being hoisted into the eager __common.
export const loadRest = () => import('./index');
