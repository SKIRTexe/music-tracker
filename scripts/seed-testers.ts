/**
 * Fake friends, ratings and reviews, hung off a real account's library.
 *
 * For seeing the social screens with something in them before real people
 * arrive. Everything it creates is namespaced under one email domain, so
 * `--clean` removes all of it and nothing else.
 *
 *   TARGET_EMAIL=you@example.com npx tsx scripts/seed-testers.ts
 *   TARGET_EMAIL=you@example.com npx tsx scripts/seed-testers.ts --clean
 *
 * Reviews attach to albums the target has actually rated, so they appear on
 * pages that get opened rather than on records nobody visits.
 */
import { PrismaClient } from "@prisma/client";
import { requestFriend, acceptFriend } from "../src/lib/social";
import { saveReview, react, addReply } from "../src/lib/reviews";

const prisma = new PrismaClient();

/** Every seeded account lives here, so cleanup is exact. */
const DOMAIN = "@testers.recordcrate.invalid";

const PEOPLE = [
  { handle: "marasol", name: "Mara Solberg", initials: "MS", isPublic: true },
  { handle: "devkap", name: "Dev Kapoor", initials: null, isPublic: true },
  { handle: "linnyt", name: "Linnea Thorne", initials: "LT", isPublic: false },
  { handle: "obicoker", name: "Obi Coker", initials: null, isPublic: true },
  { handle: "yuki_m", name: "Yuki Mori", initials: "YM", isPublic: true },
];

/** Not a friend. Their public reviews are what the popular section is made of. */
const STRANGERS = [
  { handle: "halvard", name: "Halvard Nyström", initials: "HN", isPublic: true },
  { handle: "rosacm", name: "Rosa Camara", initials: "RC", isPublic: true },
];

const REVIEWS = [
  "Every time I come back to this I find something I walked past the first ten times.",
  "The production is doing so much quiet work. Listen to it on headphones once and you can't unhear it.",
  "Not their best and I don't care. It's the one I actually reach for.",
  "Sounds exactly like the year it came out, in the best possible way.",
  "Front half is untouchable. Back half I could take or leave, honestly.",
  "I resisted this for years out of pure contrarianism. It won.",
  "A record that gets better the worse your week has been.",
  "Overlong by two tracks and still a nine.",
];

const REPLIES = [
  "Completely agree about the back half.",
  "This made me put it on again.",
  "Hard disagree but I respect it.",
  "The headphones thing is real.",
];

async function clean() {
  const gone = await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  console.log(`removed ${gone.count} seeded accounts (and everything cascading from them)`);
}

(async () => {
  if (process.argv.includes("--clean")) {
    await clean();
    await prisma.$disconnect();
    return;
  }

  const email = process.env.TARGET_EMAIL;
  if (!email) throw new Error("TARGET_EMAIL is not set");

  const target = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, handle: true },
  });

  // Rebuild from scratch, so running twice does not double anything.
  await clean();

  const albums = await prisma.albumLog.findMany({
    where: { userId: target.id, itemType: "ALBUM", rating: { not: null } },
    orderBy: { rating: "desc" },
    take: 8,
    select: { mbid: true, albumTitle: true, artistName: true, coverUrl: true },
  });
  if (albums.length === 0) throw new Error("target has no rated albums to hang reviews on");

  const make = async (p: (typeof PEOPLE)[number]) =>
    prisma.user.create({
      data: {
        email: p.handle + DOMAIN,
        handle: p.handle,
        name: p.name,
        initials: p.initials,
        isPublic: p.isPublic,
      },
      select: { id: true, name: true },
    });

  const friends = [];
  for (const p of PEOPLE) {
    const user = await make(p);
    await requestFriend(user.id, target.id);
    await acceptFriend(target.id, user.id);
    friends.push(user);
  }
  const strangers = [];
  for (const p of STRANGERS) strangers.push(await make(p));

  // Ratings, so the friends feed and the community average have something.
  let seed = 0;
  const everyone = [...friends, ...strangers];
  for (const person of everyone) {
    for (const album of albums) {
      seed += 1;
      // Spread scores so the ladder and the community average look plausible
      // rather than everyone agreeing on 8.5.
      const rating = Math.round((6.4 + ((seed * 37) % 36) / 10) * 10) / 10;
      const when = new Date(Date.now() - ((seed * 7) % 200) * 3600_000);
      await prisma.albumLog.upsert({
        where: { userId_mbid: { userId: person.id, mbid: album.mbid } },
        create: {
          userId: person.id, mbid: album.mbid, albumTitle: album.albumTitle,
          artistName: album.artistName, coverUrl: album.coverUrl,
          itemType: "ALBUM", status: "LISTENED", rating,
          addedAt: when, updatedAt: when,
        },
        update: { rating },
      });
    }
  }

  // Reviews: friends write a mix of friends-only and public; strangers write
  // public ones, which is what the popular section can draw on.
  //
  // Everyone reviews the top two albums, so those pages have enough to fill a
  // three-popular-plus-three-friends window and to sort meaningfully.
  let wrote = 0;
  for (const [index, person] of everyone.entries()) {
    const isStranger = index >= friends.length;
    for (let n = 0; n < (isStranger ? 4 : 3); n++) {
      const album = n < 2 ? albums[n] : albums[(index + n) % albums.length];
      const visibility = isStranger ? "PUBLIC" : n === 1 ? "FRIENDS" : "PUBLIC";
      await saveReview({
        userId: person.id,
        mbid: album.mbid,
        body: REVIEWS[(index * 2 + n) % REVIEWS.length],
        visibility: visibility as "PUBLIC" | "FRIENDS",
      });
      wrote += 1;
    }
  }

  // Likes and replies, so the popular list is genuinely sorted by something and
  // the reply UI has threads to open.
  const written = await prisma.review.findMany({
    where: { user: { email: { endsWith: DOMAIN } } },
    select: { id: true, userId: true },
  });
  let liked = 0;
  let disliked = 0;
  for (const [i, review] of written.entries()) {
    const audience = everyone.filter((p) => p.id !== review.userId);
    // Vary how many people liked each, so "popular" has a real order.
    const likers = audience.slice(0, (i * 3) % 5);
    for (const liker of likers) {
      await react({ reviewId: review.id, userId: liker.id, value: 1 });
      liked += 1;
    }
    // And give roughly every third review an argument on it. Without dislikes
    // the controversial sort has nothing to rank and looks identical to
    // popular — which is exactly how it read the first time this ran.
    if (i % 3 === 1) {
      for (const hater of audience.slice(likers.length, likers.length + 2 + (i % 2))) {
        await react({ reviewId: review.id, userId: hater.id, value: -1 });
        disliked += 1;
      }
    }
    if (i % 3 === 0) {
      const replier = everyone.find((p) => p.id !== review.userId)!;
      await addReply({ reviewId: review.id, userId: replier.id, body: REPLIES[i % REPLIES.length] });
    }
  }

  console.log(`seeded for @${target.handle ?? email}`);
  console.log(`  ${friends.length} friends, ${strangers.length} strangers`);
  console.log(`  ${everyone.length * albums.length} ratings across ${albums.length} albums`);
  console.log(`  ${wrote} reviews, ${liked} likes, ${disliked} dislikes`);
  await prisma.$disconnect();
})();
