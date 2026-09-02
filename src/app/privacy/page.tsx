import Link from "next/link";

export const metadata = { title: "Privacy — Recordcrate" };

/**
 * The privacy policy.
 *
 * App Store Connect requires a reachable privacy policy URL before a build can
 * go to external testers or to review, and it has to describe what the app
 * actually does — a generic template that does not match the App Privacy
 * answers is a rejection.
 *
 * Everything here was written against the schema and the code, not from a
 * template: the data listed is the columns that exist, and the third parties
 * listed are the hosts the server actually contacts.
 */

const UPDATED = "1 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
      <div className="space-y-2 text-xs leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-16 pt-10">
      <header className="space-y-1">
        <h1 className="text-lg font-medium text-zinc-100">Privacy Policy</h1>
        <p className="text-[11px] text-zinc-600">Last updated {UPDATED}</p>
      </header>

      <p className="text-xs leading-relaxed text-zinc-400">
        Recordcrate is a place to record the music you have listened to and what you
        thought of it. It is run by an individual, not a company. This policy covers
        both the website and the iOS app, which share one account and one database.
      </p>

      <Section title="What is collected">
        <p>
          <strong className="text-zinc-300">Your account.</strong> An email address, and
          a display name if you give one. If you sign in with a password, only a bcrypt
          hash of it is stored — never the password itself. If you use Sign in with
          Apple, no password exists for your account at all, and if you chose to hide
          your address, what is stored is Apple&rsquo;s relay address rather than your
          real one.
        </p>
        <p>
          <strong className="text-zinc-300">Your profile.</strong> If you choose a
          handle, a display name, initials or a bio, those are stored so friends can
          find you. A handle is visible to anyone who searches for it. Nothing else
          about you is visible to other people unless you switch your profile to
          public, or accept a friend request.
        </p>
        <p>
          <strong className="text-zinc-300">Friends.</strong> Who you are friends
          with, and pending requests. Deleting a friendship deletes the record of it.
        </p>
        <p>
          <strong className="text-zinc-300">What you save.</strong> The albums and songs
          you add, whether you have listened to them or want to, your ratings, and the
          time each was added or changed. This is the content of the service.
        </p>
        <p>
          <strong className="text-zinc-300">Nothing else.</strong> There is no
          analytics, no advertising, no third-party tracking SDK, and no device
          identifier. Your data is not sold or shared, and nothing here is used to
          track you across other apps or websites.
        </p>
      </Section>

      <Section title="Who it is shared with">
        <p>
          The service is hosted on <strong className="text-zinc-300">Vercel</strong>, and
          the database is <strong className="text-zinc-300">Supabase</strong>. Both hold
          the data above in order to run the service.
        </p>
        <p>
          To show you records, the server queries{" "}
          <strong className="text-zinc-300">Spotify</strong>,{" "}
          <strong className="text-zinc-300">Deezer</strong> and{" "}
          <strong className="text-zinc-300">MusicBrainz</strong>. These are searches for
          album and artist information. Your identity is not sent with them.
        </p>
        <p>
          If you connect Spotify yourself, the app can create and update a playlist in
          your Spotify account, and — if you grant it — read which tracks you listen to
          most, so it can suggest records you have played but never rated. Your Spotify
          account id is stored to keep that connection working. It is optional, is only
          made when you ask for it, and can be removed at any time from Settings or from
          Profile in the app.
        </p>
        <p>
          If you sign in with Apple, <strong className="text-zinc-300">Apple</strong>{" "}
          confirms your identity to the server. Email, when it is sent, goes through{" "}
          <strong className="text-zinc-300">Resend</strong>.
        </p>
      </Section>

      <Section title="Deleting everything">
        <p>
          You can delete your account at any time — in the app under Profile, or on the
          website under{" "}
          <Link href="/settings" className="text-zinc-300 underline underline-offset-2">
            Settings
          </Link>
          . It is immediate and permanent: your account, your library, your ratings and
          every linked service are removed from the database, and any Sign in with Apple
          grant is revoked. There is no soft delete and no recovery, so export anything
          you want to keep first.
        </p>
        <p>
          Cached information about albums and artists is kept, because it describes
          records rather than people and identifies nobody.
        </p>
      </Section>

      <Section title="Security">
        <p>
          All traffic uses HTTPS. Passwords are hashed with bcrypt. On your phone, your
          sign-in token is held in the iOS Keychain, and it can be invalidated from the
          server — signing out or resetting your password ends every other session.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Recordcrate is not directed at children under 13, and accounts are not
          knowingly created for them.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes in a way that affects what is collected, the date at
          the top will change. Questions, or a request to see or remove your data, can
          go to the address on the{" "}
          <Link href="/support" className="text-zinc-300 underline underline-offset-2">
            support page
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
