import Link from "next/link";
import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6">Sign in</h1>
      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirectTo: "/",
          });
        }}
        className="flex flex-col gap-4"
      >
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
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:border-zinc-600"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 rounded-md font-semibold transition-colors"
        >
          Sign in
        </button>
      </form>
      <p className="mt-4 text-zinc-400 text-sm text-center">
        No account?{" "}
        <Link href="/register" className="text-zinc-400 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
