import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <span className="text-sm font-semibold text-zinc-300 tracking-wide group-hover:text-zinc-100 transition-colors">
            Recordcrate
          </span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            Discover
          </Link>
          <Link href="/decade" className="text-zinc-500 hover:text-zinc-200 transition-colors">
            Decades
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
