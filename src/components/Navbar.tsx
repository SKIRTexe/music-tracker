import Link from "next/link";
import { NavLink } from "@/components/NavLink";
import { auth, signOut } from "@/lib/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
        {/* min-w-0 so the wordmark truncates rather than pushing the links off a
            narrow phone — there are four of them once signed in. */}
        <Link href="/" className="flex min-w-0 items-center gap-2 group">
          <svg className="shrink-0" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Outer record */}
            <circle cx="11" cy="11" r="10.25" fill="#27272a" stroke="#3f3f46" strokeWidth="0.5"/>
            {/* Groove rings */}
            <circle cx="11" cy="11" r="8.5" fill="none" stroke="#3f3f46" strokeWidth="0.75"/>
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="#3f3f46" strokeWidth="0.75"/>
            <circle cx="11" cy="11" r="4.5" fill="none" stroke="#52525b" strokeWidth="0.5"/>
            {/* Label */}
            <circle cx="11" cy="11" r="3.25" fill="#52525b"/>
            {/* Center hole */}
            <circle cx="11" cy="11" r="1.1" fill="#09090b"/>
          </svg>
          <span className="truncate text-sm font-semibold text-zinc-300 tracking-wide group-hover:text-zinc-100 transition-colors">
            Recordcrate
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-3 sm:gap-6 text-sm">
          <NavLink href="/">Search</NavLink>
          {session?.user ? (
            <>
              <NavLink href="/library">Library</NavLink>
              {/* Stats moved behind Settings: it is something you look at now and
                  then, not part of the daily loop, and the nav on a 360px phone
                  has no room for a word that earns its place rarely. */}
              <NavLink href="/friends">Friends</NavLink>
              {/* An icon rather than a fifth word: the nav is already at the
                  width a 360px phone can hold. */}
              <NavLink href="/settings" aria-label="Settings" title="Settings">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </NavLink>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
