import Link from "next/link";

export const metadata = { title: "Support — Recordcrate" };

/**
 * The support page.
 *
 * App Store Connect requires a reachable support URL, and reviewers do open it.
 *
 * The contact address comes from `SUPPORT_EMAIL` rather than being written in
 * here, because putting a personal address into a public repository publishes
 * it permanently — this repo is public, and the page is crawlable. Setting the
 * variable is a decision about which address to expose, and it should be made
 * deliberately rather than inherited from whoever happened to write the file.
 */

export default function SupportPage() {
  const email = process.env.SUPPORT_EMAIL;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16 pt-10">
      <header className="space-y-1">
        <h1 className="text-lg font-medium text-zinc-100">Support</h1>
        <p className="text-xs text-zinc-500">
          Recordcrate is a small project run by one person. Bug reports are welcome and
          usually get read the same day.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-200">Get in touch</h2>
        {email ? (
          <p className="text-xs leading-relaxed text-zinc-400">
            Email{" "}
            <a
              href={`mailto:${email}`}
              className="text-brand-500 underline underline-offset-2"
            >
              {email}
            </a>
            . Please say which you were using — the app or the website — and what you
            expected to happen.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500">
            A contact address has not been set for this deployment yet.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-200">Using the beta</h2>
        <div className="space-y-3 text-xs leading-relaxed text-zinc-400">
          <p>
            The iOS app is in TestFlight. Signing in with{" "}
            <strong className="text-zinc-300">Continue with Apple</strong> is the
            easiest way to start — it creates the account and there is no password
            to lose.
          </p>
          <p>
            <strong className="text-zinc-300">Connecting Spotify is limited
            during the beta.</strong> Spotify caps how many people can authorise a
            developing app, so playlist sync and listening suggestions may refuse
            to connect. Everything else — searching, saving, rating, friends —
            works regardless.
          </p>
          <p>
            Reporting something broken is genuinely useful. Say what you tapped
            and what happened instead; a screenshot beats a description.
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-200">Common questions</h2>
        <div className="space-y-3 text-xs leading-relaxed text-zinc-400">
          <p>
            <strong className="text-zinc-300">I forgot my password.</strong> Use{" "}
            <Link href="/forgot" className="text-zinc-300 underline underline-offset-2">
              the reset page
            </Link>
            . If you signed up with Apple there is no password — use Continue with Apple
            again and you will land back in the same account.
          </p>
          <p>
            <strong className="text-zinc-300">How do I delete my account?</strong> In the
            app, Profile → Delete account. On the website,{" "}
            <Link href="/settings" className="text-zinc-300 underline underline-offset-2">
              Settings
            </Link>
            . It is immediate and cannot be undone.
          </p>
          <p>
            <strong className="text-zinc-300">An album is missing or wrong.</strong> Album
            and artist information comes from Spotify, with listening figures from
            Deezer. If something is wrong at the source it will be wrong here too.
          </p>
          <p>
            <strong className="text-zinc-300">What happens to my data?</strong> See the{" "}
            <Link href="/privacy" className="text-zinc-300 underline underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
