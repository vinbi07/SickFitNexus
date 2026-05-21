const DEFAULT_PUBLIC_APP_URL = "https://sickfit-nexus.vercel.app";

function resolvePublicAppUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return DEFAULT_PUBLIC_APP_URL;
}

export function buildLookbookUrl(accessToken: string) {
  return `${resolvePublicAppUrl()}/lookbook/${accessToken}`;
}
