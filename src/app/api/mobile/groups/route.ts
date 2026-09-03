import { NextResponse } from "next/server";
import { authed } from "@/lib/mobile-auth";
import {
  groupsFor, createGroup, deleteGroup, updateGroup,
  setGroupMembership, MAX_GROUP_NAME,
} from "@/lib/collections";

/**
 * Your groups. Pass `?mbid=` and each one also says whether that album is in it,
 * which is what the add-to-group sheet needs in a single request.
 */
export const GET = authed(async (req, userId) => {
  const mbid = new URL(req.url).searchParams.get("mbid") ?? undefined;
  return NextResponse.json({ groups: await groupsFor(userId, mbid) });
});

/**
 * Create a group, or move an album in or out of one.
 *
 * Both live here because the sheet does both from the same place — typing a new
 * name and ticking an existing one are one gesture apart, and two endpoints
 * would mean the client deciding which it just did.
 */
export const POST = authed(async (req, userId) => {
  let body: {
    action?: string; name?: string; groupId?: string;
    mbid?: string; member?: boolean; color?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.action === "create") {
    const result = await createGroup(userId, body.name ?? "", body.color);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error, maxLength: MAX_GROUP_NAME },
        { status: result.error === "exists" ? 409 : 422 }
      );
    }
    // If an album came with it, put it straight in — creating a group from the
    // add-to-group sheet always means "and add this one".
    if (body.mbid) {
      await setGroupMembership({
        userId, groupId: result.group.id, mbid: body.mbid, member: true,
      });
      return NextResponse.json({ group: { ...result.group, count: 1, contains: true } });
    }
    return NextResponse.json(result);
  }

  if (body.action === "member") {
    if (!body.groupId || !body.mbid) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const ok = await setGroupMembership({
      userId, groupId: body.groupId, mbid: body.mbid, member: body.member !== false,
    });
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ groups: await groupsFor(userId, body.mbid) });
  }

  // One action for name and colour: the edit sheet changes either, and two
  // endpoints would mean the client deciding which field it just touched.
  if (body.action === "update") {
    if (!body.groupId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const ok = await updateGroup(userId, body.groupId, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    });
    if (!ok) return NextResponse.json({ error: "invalid" }, { status: 422 });
    return NextResponse.json({ groups: await groupsFor(userId, body.mbid ?? undefined) });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
});

export const DELETE = authed(async (req, userId) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json({ deleted: await deleteGroup(userId, id) });
});
