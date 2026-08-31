import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import { findPeople } from "@/lib/social";
import { clientKey, memoryLimit, tooMany } from "@/lib/rate-limit";

/** Find people by handle or display name. Never by email — see `findPeople`. */
export const GET = authed(async (req, userId) => {
  const gate = memoryLimit(clientKey(req, "people"), 60, 60_000);
  if (!gate.ok) return tooMany(gate.retryAfter);

  const query = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ people: await findPeople(query, userId) });
});
