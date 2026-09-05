// Storage on the JS thread stalls the POS during sync. Keep the previous expo-opfs
// path for A/B measurements: flip to 'js-thread' and reload to compare.
// Roots are separate; switching does not migrate pending local changes.
export const NATIVE_STORAGE_HOST: 'worklet' | 'js-thread' = 'worklet';
