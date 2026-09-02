/**
 * Rebuild the App Review demo account.
 *
 * App Review needs credentials because the app is behind a sign-in, and a
 * reviewer who lands in an empty app cannot tell "nothing here yet" from
 * "broken". So this seeds a library, ratings, a friend and a friend's ratings —
 * enough that every screen has something on it.
 *
 * **Idempotent, and that is the point.** Apple explicitly tests that account
 * deletion works, which means a reviewer may well delete this account. Running
 * this again puts it back exactly as it was, so the next submission is not
 * blocked by the last review having done its job.
 *
 *   DEMO_PASSWORD='...' npx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { requestFriend, acceptFriend } from "../src/lib/social";

const prisma = new PrismaClient();

const DEMO_EMAIL = "recordcrate.support+appreview@gmail.com";
const FRIEND_EMAIL = "recordcrate.support+demofriend@gmail.com";
/*
 * A third account, purely so the community average has something to average.
 * It shows nothing below COMMUNITY_MIN_RATINGS, so with two accounts the
 * feature is invisible during review — which reads as missing rather than as
 * working correctly on a small dataset.
 */
const THIRD_EMAIL = "recordcrate.support+demothird@gmail.com";

interface Album { id: string; title: string; artist: string; cover: string | null; year: string | null }

(async () => {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD is not set");

  const albums: Album[] = JSON.parse(
    readFileSync(new URL("./demo-albums.json", import.meta.url), "utf8")
  );

  // Start from nothing rather than patching, so a half-deleted account from a
  // previous review cannot leave this in a state nobody has ever seen.
  await prisma.user.deleteMany({
    where: { email: { in: [DEMO_EMAIL, FRIEND_EMAIL, THIRD_EMAIL] } },
  });

  const hash = await bcrypt.hash(password, 12);

  const demo = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      password: hash,
      name: "Alex Reviewer",
      handle: "alexdemo",
      initials: "AR",
      bio: "Demo account for App Review.",
      isPublic: true,
      rankingEnabled: true,
    },
    select: { id: true },
  });

  const friend = await prisma.user.create({
    data: {
      email: FRIEND_EMAIL,
      password: hash,
      name: "Sam Rivera",
      handle: "samdemo",
      initials: "SR",
      isPublic: true,
    },
    select: { id: true },
  });

  const third = await prisma.user.create({
    data: {
      email: THIRD_EMAIL, password: hash, name: "Jo Nakamura",
      handle: "jodemo", initials: "JN", isPublic: true,
    },
    select: { id: true },
  });

  await requestFriend(friend.id, demo.id);
  await acceptFriend(demo.id, friend.id);

  // Ratings spread across the band boundaries so the comparison ladder has a
  // real shape, and a couple left unrated so "want to listen" is not empty.
  const ratings = [9.3, 9.0, 8.7, 8.4, 8.1, 7.6, 7.2, 6.8, 6.1, 5.4];
  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    const rated = i < ratings.length;
    const when = new Date(Date.now() - (i * 31 + 3) * 3600_000);
    await prisma.albumLog.create({
      data: {
        userId: demo.id, mbid: a.id, albumTitle: a.title, artistName: a.artist,
        coverUrl: a.cover, releaseYear: a.year ? Number(a.year) : null,
        itemType: "ALBUM",
        status: rated ? "LISTENED" : "WANT",
        rating: rated ? ratings[i] : null,
        addedAt: when, updatedAt: when,
      },
    });
  }

  // The friend rates a few too, so the Friends feed has something in it. Three
  // overlap with the demo account's, which is what the community average needs
  // before it will show a number at all.
  const friendPicks = [0, 2, 4, 6, 8];
  for (const i of friendPicks) {
    const a = albums[i];
    const when = new Date(Date.now() - (i * 11 + 5) * 3600_000);
    await prisma.albumLog.create({
      data: {
        userId: friend.id, mbid: a.id, albumTitle: a.title, artistName: a.artist,
        coverUrl: a.cover, itemType: "ALBUM", status: "LISTENED",
        rating: [8.8, 7.4, 9.1, 6.5, 8.0][friendPicks.indexOf(i)],
        addedAt: when, updatedAt: when,
      },
    });
  }

  // The third account rates the same records the other two did, which is what
  // pushes the overlapping albums over the disclosure floor.
  const thirdPicks = [0, 2, 4, 6, 8];
  const thirdScores = [9.0, 8.0, 8.6, 7.0, 7.5];
  for (let i = 0; i < thirdPicks.length; i++) {
    const a = albums[thirdPicks[i]];
    await prisma.albumLog.create({
      data: {
        userId: third.id, mbid: a.id, albumTitle: a.title, artistName: a.artist,
        coverUrl: a.cover, itemType: "ALBUM", status: "LISTENED",
        rating: thirdScores[i],
      },
    });
  }

  console.log("demo account rebuilt");
  console.log("  email  :", DEMO_EMAIL);
  console.log("  library:", albums.length, "items,", ratings.length, "rated");
  console.log("  friend :", "@samdemo with", friendPicks.length, "ratings");
  await prisma.$disconnect();
})();
