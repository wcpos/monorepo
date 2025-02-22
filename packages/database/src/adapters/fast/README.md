Intitally I thought we could have a fast adapter for the sync state lookups by using memory-synced storage,
it's okay for small stores, but as the number of records grows, there is a actually a performance hit from the memory-synced storage.

We might revisit this in the future, but for now we're sticking with the default adapter.

## Electron

We are actually using memory-mapped storage for the fast adapter on electron. I need to do more testing with this to check memory usage and performance.

## NOTE

Memory syncing will not work with attachments, only collections that don't need attachments should go here.
