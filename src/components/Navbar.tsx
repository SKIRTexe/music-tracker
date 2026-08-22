import Link from "next/link";
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
          <Link href="/" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            Search
          </Link>
          {session?.user ? (
            <>
              <Link href="/library" className="text-zinc-500 hover:text-zinc-200 transition-colors">
                Library
              </Link>
              <Link href="/stats" className="text-zinc-500 hover:text-zinc-200 transition-colors">
                Stats
              </Link>
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
