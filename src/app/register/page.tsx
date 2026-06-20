import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

export default function RegisterPage() {
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6">Create account</h1>
      <form
        action={async (formData: FormData) => {
          "use server";
          const name = formData.get("name") as string;
          const email = formData.get("email") as string;
          const password = formData.get("password") as string;
          const hashed = await bcrypt.hash(password, 12);
          await prisma.user.create({
            data: { name, email, password: hashed },
          });
          redirect("/login");
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Name</label>
          <input
            name="name"
            type="text"
            required
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-600"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400 mb-1">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md font-semibold transition-colors"
        >
          Create account
        </button>
      </form>
      <p className="mt-4 text-zinc-400 text-sm text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-zinc-400 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
