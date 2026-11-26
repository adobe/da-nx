# Media Library image insertion

Media Library Insert and image Copy use a verified DA source URL for same-site
named images. A named preview URL can require browser authentication that is
unavailable during server-side image ingestion, producing `about:error` even
when the author can view the image.

Before inserting or copying a named image from the site's standard delivery
host, the library checks the corresponding DA source with an authenticated
HEAD request. An existing image uses its environment-appropriate
`content.da.live` URL. This does not change the indexed URL, display name, or
asset identity.

Hashed image URLs, external URLs, and non-image links remain unchanged. A
missing DA source (404) also leaves the URL unchanged, preserving images
served only from code. Permission, network, server, and invalid-image responses
show an error rather than inserting or copying an unverified URL.
