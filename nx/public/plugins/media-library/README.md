# Media Library Plugin

A DA plugin for browsing and inserting media from your site's media library index into documents. Provides a full-featured media browsing interface with search, filtering, and preview capabilities.

## How to Use

1. Open the plugin from the DA library.
2. **Browse** or **search** for media items (images, videos, documents, fragments, icons).
3. Click a media item to see details and usage information.
4. Click **Insert** to add the media to your document.

## Output

The plugin inserts media references appropriate to the selected item type (image URLs, fragment links, etc.).

## Configuration

Register in your DA site config library sheet:

| title            | path                                                                          | experience        |
| ---------------- | ----------------------------------------------------------------------------- | ----------------- |
| `Media Library`  | `https://da.live/nx/public/plugins/media-library/media-library.html`         | `fullsize-dialog` |

## Features

- **Full media browsing** powered by the DA media library app
- **Search and filtering** by media type (images, videos, documents, fragments, icons)
- **Folder navigation** and document-based filtering
- **Media details** including dimensions, file size, and usage information
- **Live preview** of media items
- **Responsive design** with dark mode support

## Files

| File                  | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `media-library.html`  | Plugin shell that loads the media library app |
| `media-library.css`   | Shell layout styles with dark mode support |

## Dependencies

- [DA App SDK](https://da.live/nx/utils/sdk.js) — context and document actions
- [DA Media Library App](https://da.live/nx/blocks/media-library/media-library.js) — full media browsing interface
- The media library app internally uses nx2 APIs (`source.list`, `daFetch`)
- No build step; plain ES modules

## Media Library Index

The plugin reads from your site's media library index located at `/.milo/media-library.json`. This index is automatically maintained by the DA media library indexing system and includes all media assets across your site.
