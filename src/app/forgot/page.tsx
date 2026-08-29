import { ForgotForm } from "@/components/ForgotForm";
import Link from "next/link";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="mb-1 text-lg font-medium text-zinc-100">Reset your password</h1>
      <p className="mb-6 text-xs leading-relaxed text-zinc-500">
        Enter the address you signed up with and we&rsquo;ll send a link to choose a
        new password. The link lasts an hour.
      </p>
      <ForgotForm />
      <p className="mt-6 text-xs text-zinc-600">
        <Link href="/login" className="underline underline-offset-2 hover:text-zinc-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
