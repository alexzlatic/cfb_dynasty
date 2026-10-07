import { useEffect, useState } from "react";

/** Hash routes: #/ , #/new , #/l/<league>/<screen>/<arg> */
export function useRoute(): string[] {
  const parse = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (...parts: (string | number)[]) => { location.hash = "/" + parts.map((p) => encodeURIComponent(String(p))).join("/"); };
