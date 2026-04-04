Storage adapters for each platform.

## Web - OPFS

The web adapter uses a web worker to offload the database operations to a separate thread and stores data in OPFS.

## Electron - filesystem-node-ipc

The electron adapter uses the filesystem-node IPC bridge for database storage.

## Native - Expo Filesystem

The expo adapter uses the Expo Filesystem-backed storage implementation.
