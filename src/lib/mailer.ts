/**
 * Sending email, with no dependency and no provider lock-in.
 *
 * Resend's REST API over `fetch` rather than an SDK: the whole surface this app
 * needs is one POST, and a package for that is a supply-chain risk and a build
 * cost for nothing.
 *
 * **Unconfigured is a supported state.** Without `RESEND_API_KEY` this logs and
 * reports failure rather than throwing, so the app runs in development and in
 * any deployment where email is not set up yet. Every caller has to handle a
 * `false` anyway — mail fails for a hundred ordinary reasons — so there is no
 * value in a second failure mode that only happens to be about configuration.
 */

export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.warn(`mailer: not configured, dropping "${opts.subject}" to ${opts.to}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      // The body can carry the recipient, so only the status is logged.
      console.error("mailer: send failed", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("mailer:", err instanceof Error ? err.message : err);
    return false;
  }
}
