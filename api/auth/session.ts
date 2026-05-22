import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookieValue, verifyToken, COOKIE_NAME } from "./_lib";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawToken = parseCookieValue(
    req.headers.cookie as string | undefined,
    COOKIE_NAME,
  );

  if (!rawToken) {
    return res.status(401).json({ user: null });
  }

  const payload = await verifyToken(rawToken);
  if (!payload) {
    return res.status(401).json({ user: null });
  }

  return res.status(200).json({
    user: {
      id:           payload.sub,
      email:        payload.email,
      display_name: payload.display_name,
    },
  });
}
