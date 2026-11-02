import { DatabaseSync } from 'node:sqlite';
import { getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';
export function sqliteBasicsNodeNative() {
  const sqliteBasics = getSQLiteBasicsNodeNative(DatabaseSync), open = sqliteBasics.open;
  sqliteBasics.open = async path => {
    const db = await open(path);
    db.exec('PRAGMA synchronous = NORMAL');
    return db;
  };
  return sqliteBasics;
}
