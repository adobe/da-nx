/* tslint:disable */
/* eslint-disable */

/**
 * Return the raw bytes of one zip entry by name (e.g. "thumbnail.png" or
 * "images/<hash>") so the caller can write assets to disk / use them directly.
 */
export function get_entry(bytes: Uint8Array, name: string): Uint8Array;

/**
 * Inspect a `.fig` file. Returns a JSON string:
 * ```jsonc
 * {
 *   file_name, meta, thumbnail_base64,
 *   images: [ {
 *     name, hash, size, mime, width, height,
 *     layer_name,             // node name (schema decode) or heuristic guess; null if neither found
 *     bbox: { x, y, w, h },   // canvas-coordinate bounding box; null if geometry unavailable (see geometry_source)
 *     section,                // nearest containing top-level frame/section name; null if none / unavailable
 *     order,                  // document-order index of the owning node; null alongside bbox/section
 *   } ],
 *   text: [..], schema_bytes, document_bytes,
 *   geometry_source,          // "kiwi-schema-decode: N nodeChanges" or "unavailable: <reason>"
 * }
 * ```
 * `width`/`height` are parsed from each image's own file header (PNG/JPEG/WebP).
 * `bbox`/`section`/`order` come from a schema-driven kiwi decode of the
 * document (see the "per-image layout" module doc comment above
 * `build_layout_index`) — high confidence when it converges, `null` (never
 * fabricated) otherwise. `layer_name` prefers that same decode's real node
 * name; falls back to a byte-proximity heuristic (`find_layer_name`) only
 * when the structural decode didn't find the owning node.
 */
export function inspect_fig(bytes: Uint8Array): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly get_entry: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly inspect_fig: (a: number, b: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
