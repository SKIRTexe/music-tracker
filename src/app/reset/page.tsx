import { ResetForm } from "@/components/ResetForm";
import Link from "next/link";

export const metadata = { title: "Choose a new password" };

/**
 * The page a reset link opens.
 *
 * The token is not checked here. Doing so would turn every preview fetch — mail
 * clients and security scanners routinely follow links — into a redemption
 * attempt, and a link that is dead before the user clicks it is worse than one
 * that reports failure a moment later.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; id?: string }>;
}) {
  const { token, id } = await searchParams;

  if (!token || !id) {
    return (
      <div className="mx-auto max-w-sm pt-16">
        <h1 className="mb-1 text-lg font-medium text-zinc-100">This link is incomplete</h1>
        <p className="text-xs leading-relaxed text-zinc-500">
          Open the link from the email exactly as it was sent, or{" "}
          <Link href="/forgot" className="underline underline-offset-2 hover:text-zinc-300">
            ask for a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="mb-1 text-lg font-medium text-zinc-100">Choose a new password</h1>
      <p className="mb-6 text-xs leading-relaxed text-zinc-500">
        At least 8 characters. Setting it signs you out everywhere else.
      </p>
      <ResetForm userId={id} token={token} />
    </div>
  );
}
