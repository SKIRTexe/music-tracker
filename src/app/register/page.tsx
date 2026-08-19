import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-zinc-100">Create account</h1>

      {error === "exists" && (
        <p className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
          An account with that email already exists.{" "}
          <Link href="/login" className="underline underline-offset-2">Sign in instead</Link>.
        </p>
      )}
      {error === "invalid" && (
        <p className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded px-3 py-2">
          Please enter a valid email and a password of at least 8 characters.
        </p>
      )}

      <form
        action={async (formData: FormData) => {
          "use server";
          const name = (formData.get("name") as string)?.trim();
          const email = (formData.get("email") as string)?.trim().toLowerCase();
          const password = formData.get("password") as string;

          if (!email?.includes("@") || !password || password.length < 8) {
            redirect("/register?error=invalid");
          }

          const existing = await prisma.user.findUnique({ where: { email } });
          if (existing) redirect("/register?error=exists");

          const hashed = await bcrypt.hash(password, 12);
          await prisma.user.create({ data: { name: name || null, email, password: hashed } });

          redirect("/login?registered=1");
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="name" className="block text-sm text-zinc-400 mb-1">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
        </div>
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
            minLength={8}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
          <p className="text-xs text-zinc-600 mt-1">At least 8 characters.</p>
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-zinc-100 hover:bg-white rounded-md text-zinc-900 font-semibold transition-colors"
        >
          Create account
        </button>
      </form>
      <p className="mt-4 text-zinc-500 text-sm text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-zinc-300 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
