/**
 * Node resolve hook so the real Next.js route handlers can be imported by
 * `node --test` for cookie-aware tests.
 *
 * Two mappings are needed:
 * - `@/x`            -> `<apps/web>/x.ts`   (the tsconfig path alias)
 * - `next/server`    -> `next/server.js`    (Next ships no exports map, so Node
 *                                            ESM cannot resolve the bare subpath)
 */
const APP_ROOT = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`${specifier.slice(2)}.ts`, APP_ROOT).href, context);
  }
  return nextResolve(specifier, context);
}
