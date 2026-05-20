export const PUBLIC_APP_URL = "https://sickfit-nexus.vercel.app";

export function buildLookbookUrl(accessToken: string) {
  return `${PUBLIC_APP_URL}/lookbook/${accessToken}`;
}
