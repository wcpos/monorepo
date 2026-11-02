import { Directory, Paths } from 'expo-file-system';

// Separate from both retired engines; native v8 starts fresh without a generation bump.
export const NATIVE_SQLITE_ROOT = new Directory(Paths.document, 'wcpos-sqlite');
