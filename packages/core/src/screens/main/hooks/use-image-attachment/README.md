I'm not sure what the best way to store product images:

`expo-image` caches the images to disk by default, there's also an option to cache in memory and disk.
I assume these images stay in the cache forever, or atleast until the user manually clears the cache.

I'm not sure how `expo-image` works on the web, I need to research the cache contact. I assume the images
won't persist from one session to the next. 

For the moment, the web application will persist the images as document attachments in RxDB. This may 
be overkill for what we need.

Storing images in the RxDB is not worthwhile on iOS/Android. The Blob API is funky and I think we just let
`image-expo` do it's thing.

@TODO - test apps when offline, if persistent storage is required, look at creating a FileSystem adapter 
for each platform.