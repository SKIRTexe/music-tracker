import { NextResponse } from "next/server";
import { issueToken, verifyCredentials } from "@/lib/mobile-auth";

/**
 * Exchange email and password for a bearer token.
 *
 * Only the credentials provider is offered here. GitHub sign-in is a browser
 * redirect flow, and an account created that way has no `password` to check —
 * such a user gets the same "invalid credentials" answer as a wrong password,
 * which is honest enough: there is no password that would work.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ token: await issueToken(user.id), user });
}
