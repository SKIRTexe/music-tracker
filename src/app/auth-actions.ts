"use server";

import { headers } from "next/headers";
import { requestReset, completeReset, type ResetOutcome } from "@/lib/password-reset";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** The origin to build links against, so a preview deployment mails its own URL. */
async function origin(): Promise<string> {
  if (process.env.AUTH_URL) return process.env.AUTH_URL;
  const host = (await headers()).get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

/**
 * Server actions do not get a `Request`, so the limiter is keyed off the
 * forwarded headers directly — the same values `clientKey` reads.
 */
async function limiterKey(scope: string): Promise<string> {
  const head = await headers();
  const shim = new Request("https://local/", {
    headers: {
      "x-real-ip": head.get("x-real-ip") ?? "",
      "x-forwarded-for": head.get("x-forwarded-for") ?? "",
    },
  });
  return clientKey(shim, scope);
}

/** Always reports success: whether an address has an account is not disclosed. */
export async function requestPasswordReset(email: string): Promise<{ sent: true }> {
  const limit = await rateLimit(await limiterKey("forgot-web"), 5, 15 * 60_000);
  if (limit.ok && email.includes("@")) {
    requestReset(email, await origin()).catch(() => {});
  }
  return { sent: true };
}

export async function setNewPassword(
  userId: string,
  token: string,
  password: string
): Promise<ResetOutcome | "rate_limited"> {
  // Guessing a 32-byte token is not realistic, but the endpoint should still
  // not accept unlimited attempts.
  const limit = await rateLimit(await limiterKey("reset-web"), 10, 15 * 60_000);
  if (!limit.ok) return "rate_limited";

  return completeReset(userId, token, password);
}
