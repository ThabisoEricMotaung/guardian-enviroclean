// next/image does not apply basePath to string `src` values, so root-relative
// public asset paths need it added by hand. NEXT_PUBLIC_BASE_PATH is always
// defined by next.config.ts ("" for the normal root deployment).
export function withBasePath(path: `/${string}`) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
