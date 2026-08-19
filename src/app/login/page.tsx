import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const { error, registered } = await searchParams;

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-zinc-100">Sign in</h1>

      {registered && !error && (
        <p className="mb-4 text-sm text-zinc-300 bg-zinc-800/60 border border-zinc-700 rounded px-3 py-2">
          Account created. Sign in to continue.
        </p>
      )}
      {error && (
        <p className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
          Incorrect email or password.
        </p>
      )}

      <form
        action={async (formData: FormData) => {
          "use server";
          try {
            await signIn("credentials", {
              email: (formData.get("email") as string)?.trim().toLowerCase(),
              password: formData.get("password"),
              redirectTo: "/",
            });
          } catch (err) {
            // A successful sign-in throws NEXT_REDIRECT, which must propagate.
            if (err instanceof AuthError) redirect("/login?error=1");
            throw err;
          }
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm text-zinc-400 mb-1">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-zinc-400 mb-1">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-zinc-100 hover:bg-white rounded-md text-zinc-900 font-semibold transition-colors"
        >
          Sign in
        </button>
      </form>
      <p className="mt-4 text-zinc-500 text-sm text-center">
        No account?{" "}
        <Link href="/register" className="text-zinc-300 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
