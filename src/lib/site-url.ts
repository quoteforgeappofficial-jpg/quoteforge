/** The app's own public base URL, for building absolute links (e.g. a proposal's public link). */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
