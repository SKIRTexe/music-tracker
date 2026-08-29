import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

/**
 * Password reset by emailed link.
 *
 * There was no way to recover an account at all before this: a forgotten
 * password meant the library was gone, with no self-service path and nobody to
 * ask.
 *
 * **The token is stored hashed.** A reset table full of live tokens is a table
 * that hands out every account if it ever leaks — the same reason the passwords
 * beside it are hashed. What goes in the email is the only copy of the secret.
 *
 * **Asking about an address never reveals whether it exists.** The request
 * endpoint answers identically either way. Otherwise the form becomes a way to
 * enumerate the userbase, which is exactly what the sign-in endpoint already
 * takes care not to be.
 *
 * Reuses the `VerificationToken` table NextAuth defines, keyed by identifier —
 * here `reset:<userId>` — so a reset cannot be redeemed as an email
 * verification or the other way round.
 */

const TTL_MS = 60 * 60 * 1000;
const PREFIX = "reset:";

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a reset link and email it.
 *
 * Always resolves the same way. The boolean says whether mail was *sent*, which
 * only the caller's logs should ever see — never the response.
 */
export async function requestReset(email: string, origin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, password: true },
  });
  if (!user) return false;

  // An account created through Sign in with Apple has no password to reset, and
  // sending a link that sets one would quietly add a second way in that the
  // owner never asked for.
  if (!user.password) return false;

  const token = randomBytes(32).toString("base64url");
  const identifier = PREFIX + user.id;

  // One live token per user: issuing a second should retire the first, or an
  // old link in an old inbox stays usable for its full hour.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hash(token), expires: new Date(Date.now() + TTL_MS) },
  });

  const link = `${origin}/reset?token=${encodeURIComponent(token)}&id=${encodeURIComponent(user.id)}`;

  return sendMail({
    to: user.email,
    subject: "Reset your Recordcrate password",
    text: [
      "Someone asked to reset the password for this Recordcrate account.",
      "",
      "Open this link to choose a new one. It expires in an hour:",
      link,
      "",
      "If it wasn't you, you can ignore this — nothing has changed, and the link",
      "does nothing until it is opened.",
    ].join("\n"),
  });
}

export type ResetOutcome = "ok" | "invalid" | "expired" | "weak";

/**
 * Redeem a token and set the new password.
 *
 * Compared in constant time. A plain `===` on a secret leaks its prefix through
 * timing, and the whole point of this value is that guessing it is the attack.
 */
export async function completeReset(
  userId: string,
  token: string,
  password: string
): Promise<ResetOutcome> {
  if (!password || password.length < 8) return "weak";

  const row = await prisma.verificationToken.findFirst({
    where: { identifier: PREFIX + userId },
    select: { token: true, expires: true },
  });
  if (!row) return "invalid";

  const supplied = Buffer.from(hash(token));
  const stored = Buffer.from(row.token);
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    return "invalid";
  }
  if (row.expires.getTime() < Date.now()) return "expired";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(password, 12),
        // Whoever asked for this may be locked out *because* someone else is in
        // the account. Changing the password while leaving that session alive
        // would fix nothing, so every mobile token is invalidated too.
        tokenVersion: { increment: 1 },
      },
    }),
    // Single use.
    prisma.verificationToken.deleteMany({ where: { identifier: PREFIX + userId } }),
  ]);

  return "ok";
}
