// Shops the Phase 0 tools know. `domains` decides which requests are recorded in full (headers and bodies);
// requests to other hosts are only counted, so analytics and ad traffic don't bloat the capture.

export interface Site {
  id: string;
  name: string;
  startUrl: string;
  domains: string[];
}

export const SITES: Record<string, Site> = {
  jiomart: { id: "jiomart", name: "JioMart", startUrl: "https://www.jiomart.com/", domains: ["jiomart.com"] },
  dmart: { id: "dmart", name: "DMart Ready", startUrl: "https://www.dmart.in/", domains: ["dmart.in"] },
};

export function getSite(id: string): Site {
  const site = SITES[id];
  if (!site) throw new Error(`Unknown site "${id}". Known: ${Object.keys(SITES).join(", ")}`);
  return site;
}

export function isSiteHost(site: Site, host: string): boolean {
  return site.domains.some((d) => host === d || host.endsWith(`.${d}`));
}
