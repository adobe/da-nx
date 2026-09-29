# Lilt Connector API Flows

Sequence diagrams for each user action in the Lilt translation connector
(`nx/blocks/loc/connectors/lilt/`), split by concern:

- **Connect** — shared by both translation modes.
- **AI Translation** — the default mode: one `/v2/translate/file` call per language,
  polled and downloaded per file.
- **Verified Translation** — a single job (`/v2/jobs`) covering every language, polled
  and downloaded once as a zip export.

`DA Editor` is the connector code running in the browser
(`nx/blocks/loc/connectors/lilt/{index,auth}.js`). `DA_TRANSLATE` is the proxy that
injects the org/site-scoped Lilt API key server-side; the browser never sees it
directly.

## Connect

Connecting never calls Lilt's real API: `da-etc`'s `lilt` integration has no OAuth
exchange, so its login endpoint just echoes back the configured API key as the
`access_token`. "Connected" only means an IMS session exists *and* da-etc has a key
configured for this org/site.

```mermaid
sequenceDiagram
    actor User
    participant Editor as DA Editor (lilt/auth.js)
    participant Etc as da-etc
    participant IMS as Adobe IMS

    User->>Editor: Open Translate panel / click Connect
    Editor->>IMS: imsAccessToken()
    IMS-->>Editor: IMS access token (or triggers sign-in)
    Editor->>Etc: POST /integrations/lilt/login?env=prod
    Etc-->>Editor: { access_token: <configured apiKey> }
    alt IMS token AND apiKey both present
        Editor-->>User: Connected
    else missing either
        Editor-->>User: "Connection to Lilt failed."
    end
```

## AI Translation

```mermaid
sequenceDiagram
    actor User
    participant Editor as DA Editor (lilt/index.js)
    participant Proxy as DA_TRANSLATE proxy
    participant Lilt as Lilt API

    User->>Editor: Send for translation
    Editor->>Editor: isConnected(service)
    loop each url
        Editor->>Proxy: POST /v2/files?name=...  (source content)
        Proxy->>Lilt: POST /v2/files
        Lilt-->>Proxy: { id: fileId }
        Proxy-->>Editor: { id: fileId }
    end
    Editor->>Proxy: GET /v2/memories
    Proxy->>Lilt: GET /v2/memories
    Lilt-->>Proxy: [ memories ]
    Proxy-->>Editor: [ memories ]
    loop each target language
        Note right of Editor: fileId is every uploaded file, joined
        Editor->>Proxy: POST /v2/translate/file?fileId=<all ids>&memoryId=...
        Proxy->>Lilt: POST /v2/translate/file
        Lilt-->>Proxy: [ { id: translationId, fileId } ]
        Proxy-->>Editor: [ { id: translationId, fileId } ]
    end
    Editor-->>User: Per-language sent/error status

    Note over User,Lilt: Later, polling status (repeats until terminal)
    User->>Editor: Check status
    loop each active language
        Editor->>Proxy: GET /v2/translate/file?translationIds=...
        Proxy->>Lilt: GET /v2/translate/file
        Lilt-->>Proxy: [ { id, status } ]
        Proxy-->>Editor: [ { id, status } ]
    end
    Editor-->>User: Per-language translated/error status

    Note over User,Lilt: Once translated, saving
    User->>Editor: Save
    loop each url (via downloadQueue)
        Editor->>Proxy: GET /v2/translate/files?id=<translationId>
        Proxy->>Lilt: GET /v2/translate/files
        Lilt-->>Proxy: translated file content
        Proxy-->>Editor: translated file content
        Editor->>Editor: removeDnt(), saveFn(url)
    end
```

## Verified Translation

```mermaid
sequenceDiagram
    actor User
    participant Editor as DA Editor (lilt/index.js)
    participant Proxy as DA_TRANSLATE proxy
    participant Lilt as Lilt API

    User->>Editor: Send for translation
    Editor->>Editor: isConnected(service)
    loop each url
        Editor->>Proxy: POST /v2/files?name=...  (source content)
        Proxy->>Lilt: POST /v2/files
        Lilt-->>Proxy: { id: fileId }
        Proxy-->>Editor: { id: fileId }
    end
    Editor->>Proxy: GET /v2/memories
    Proxy->>Lilt: GET /v2/memories
    Lilt-->>Proxy: [ memories ]
    Proxy-->>Editor: [ memories ]
    Editor->>Proxy: POST /v2/jobs  (fileIds, due, srcLang, languagePairs[])
    Proxy->>Lilt: POST /v2/jobs
    Lilt-->>Proxy: { id: jobId }
    Proxy-->>Editor: { id: jobId }
    Editor-->>User: All languages "created" (or error, job creation failed)

    Note over User,Lilt: Later, polling status (repeats until terminal)
    User->>Editor: Check status
    Editor->>Proxy: GET /v2/jobs/{jobId}
    Proxy->>Lilt: GET /v2/jobs/{jobId}
    Lilt-->>Proxy: { stats: { projects: [ { trgLang, isComplete } ] } }
    Proxy-->>Editor: job details
    Editor-->>User: Per-language translated (all-or-nothing) status

    Note over User,Lilt: Once translated, saving - repeats per language saved,<br/>since Lilt only exposes one zip export per job
    User->>Editor: Save
    Editor->>Proxy: POST /v2/jobs/{jobId}/export?type=files
    Proxy->>Lilt: POST /v2/jobs/{jobId}/export
    Lilt-->>Proxy: export started
    Proxy-->>Editor: export started
    loop poll until isProcessing == 0 (or -2 = failed)
        Editor->>Proxy: GET /v2/jobs/{jobId}
        Proxy->>Lilt: GET /v2/jobs/{jobId}
        Lilt-->>Proxy: { isProcessing }
        Proxy-->>Editor: { isProcessing }
    end
    Editor->>Proxy: GET /v2/jobs/{jobId}/download
    Proxy->>Lilt: GET /v2/jobs/{jobId}/download
    Lilt-->>Proxy: zip of translated files
    Proxy-->>Editor: zip of translated files
    Editor->>Editor: unzip, match by filename, removeDnt(), saveFn(url) per url
```
