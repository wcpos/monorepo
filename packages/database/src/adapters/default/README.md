Storage adapters for each platform.

## Web - IndexedDB

The web adapter uses a web worker to offload the database operations to a separate thread.

## Electron - SQLite

The electron adapter uses the `better-sqlite3` library to create a SQLite database.

## Native - SQLite

The expo adapter uses the `expo-sqlite` library to create a SQLite database.
