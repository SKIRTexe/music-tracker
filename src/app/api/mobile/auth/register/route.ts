import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { failureCode, issueToken } from "@/lib/mobile-auth";

/**
 * Create an account and return a token, so the app can sign someone up without
 * sending them to the website.
 *
 * The rules match `/register` exactly — lowercased email, 8-character minimum,
 * bcrypt cost 12. They have to: the two paths write the same column, and a
 * password hashed at a different cost or an email stored with different casing
 * would produce an account that only one of them can log into.
 */
export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = body.name?.trim() || null;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email?.includes("@") || !password || password.length < 8) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { name, email, password: await bcrypt.hash(password, 12) },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ token: await issueToken(user.id), user }, { status: 201 });
}
