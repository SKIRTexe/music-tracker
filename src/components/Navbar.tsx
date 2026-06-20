import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-zinc-300 tracking-wide">
          MusicLog
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            Discover
          </Link>
          <Link href="/library" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            My Library
          </Link>
          {session?.user ? (
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
