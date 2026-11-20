# Media library: images on saved pages (`stage: 'source'`)

On Helix 6 sites (source bus), helix-api-service writes media log entries when a page is saved, not only when it is previewed. These entries carry `stage: 'source'`. Preview entries have no `stage`.

## What a save logs

- A save that changes the set of images on a page logs one entry per image on the page (`ingest` for images the save copied to the media bus, `reuse` for the others), plus one `unlink` for each image the save removed. All entries of one save share a timestamp, and `resourcePath` is the page.
- A save that keeps the same images logs nothing.
- A save that removes the page's last image logs only the `unlink` entries. Without them, the library couldn't tell this save from a save that changed nothing.
- Uploads (DA's browse view, `/media`) also carry `stage: 'source'`, but have no `resourcePath`, so the library treats them as standalone uploads like before.

## How the index uses them

`processSourceMediaUpdates` in `nx/blocks/media-library/indexing/medialog.js` runs in both the full and the incremental build:

- The newest save of a page is its current image list.
- Each image on that list gets a row for the page with `stage: 'source'`, unless the page's preview already has a row for the image.
- A preview of the page that is newer than the save replaces the save's rows.
- Every image a save logged stays in the library. If no page uses it, it shows as unused.
- A row from a later `reuse` keeps the original name from the save that copied the image, or from the image's existing row.
- Source rows skip the check against the page's preview markdown, because a page that was only saved has none.
- An `unlink` from a save doesn't stop an image from being kept as unused (`removeOrOrphanMedia`), and doesn't count as activity for `modifiedTimestamp`.

The info panel marks such a page "Not previewed" and only offers the Document action.

## Not covered

- Deleting a source page logs nothing, so its rows stay until the page is previewed or unpreviewed.
- If helix-api-service can't read the old page and the save removes its last image, the save logs nothing, so the old rows stay until the next preview.
- Unpreviewing a page that was saved with new images after its last preview removes its rows in the incremental build, so those images show as unused. A full build shows them as "Not previewed". This fixes itself with the next full build, the next save that changes the page's images, or the next preview.
