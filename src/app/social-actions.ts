"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  requestFriend, acceptFriend, removeFriend, findPeople,
  validateHandle, normaliseHandle, type Person, type HandleError,
} from "@/lib/social";

async function viewer(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

export async function searchPeople(query: string): Promise<Person[]> {
  const me = await viewer();
  if (!me) return [];
  return findPeople(query, me);
}

export async function sendRequest(otherId: string): Promise<{ ok: boolean }> {
  const me = await viewer();
  if (!me) return { ok: false };
  await requestFriend(me, otherId);
  revalidatePath("/friends");
  return { ok: true };
}

export async function acceptRequest(otherId: string): Promise<{ ok: boolean }> {
  const me = await viewer();
  if (!me) return { ok: false };
  const ok = await acceptFriend(me, otherId);
  revalidatePath("/friends");
  return { ok };
}

/** Declines, unfriends and withdraws — all the same row. */
export async function dropFriend(otherId: string): Promise<{ ok: boolean }> {
  const me = await viewer();
  if (!me) return { ok: false };
  const ok = await removeFriend(me, otherId);
  revalidatePath("/friends");
  return { ok };
}

const HANDLE_MESSAGES: Record<HandleError, string> = {
  too_short: "Handles need at least 3 characters.",
  too_long: "Handles can be at most 20 characters.",
  bad_chars: "Letters, numbers and underscores only.",
  taken: "That handle is already taken.",
  reserved: "That handle is reserved.",
};

/**
 * Save the profile.
 *
 * The handle is the only field that can fail, because it is the only one anyone
 * else has to be able to rely on. An empty image or bio is a valid answer.
 */
export async function saveProfile(input: {
  handle: string;
  name: string;
  bio: string;
  image: string;
  isPublic: boolean;
}): Promise<{ error?: string }> {
  const me = await viewer();
  if (!me) return { error: "Not signed in." };

  const handle = normaliseHandle(input.handle);
  const problem = await validateHandle(handle, me);
  if (problem) return { error: HANDLE_MESSAGES[problem] };

  const image = input.image.trim();
  // Only http(s). A `javascript:` or `data:` URL in an attribute that ends up in
  // an <img> on someone else's profile page is a stored XSS vector.
  if (image && !/^https:\/\//i.test(image)) {
    return { error: "Image links must start with https://" };
  }

  await prisma.user.update({
    where: { id: me },
    data: {
      handle,
      name: input.name.trim() || null,
      bio: input.bio.trim() || null,
      image: image || null,
      isPublic: input.isPublic,
    },
  });

  revalidatePath("/settings");
  revalidatePath(`/u/${handle}`);
  return {};
}
