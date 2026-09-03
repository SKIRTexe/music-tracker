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

/**
 * Not friends. Their public reviews are what the popular section is made of,
 * and there are ten because the featured album needs ten distinct public
 * authors — the unique constraint is one review per person per album, so ten
 * reviews cannot come from fewer than ten people.
 */
const STRANGERS = [
  { handle: "halvard", name: "Halvard Nyström", initials: "HN", isPublic: true },
  { handle: "rosacm", name: "Rosa Camara", initials: "RC", isPublic: true },
  { handle: "tobiasw", name: "Tobias Wren", initials: null, isPublic: true },
  { handle: "amaraok", name: "Amara Okonkwo", initials: "AO", isPublic: true },
  { handle: "juneb", name: "June Baptiste", initials: null, isPublic: true },
  { handle: "kasperl", name: "Kasper Lund", initials: "KL", isPublic: true },
  { handle: "priyav", name: "Priya Venkat", initials: null, isPublic: true },
  { handle: "emreoz", name: "Emre Özkan", initials: "EÖ", isPublic: true },
  { handle: "noorh", name: "Noor Hassan", initials: null, isPublic: true },
  { handle: "gusreid", name: "Gus Reid", initials: "GR", isPublic: true },
];

/** Longer, more distinct, so fifteen on one page do not read as filler. */
const FEATURED_REVIEWS = [
  "I put this on expecting nostalgia and got something colder and better than I remembered.",
  "The sequencing is the whole trick. Shuffle it once and you'll see what I mean.",
  "Technically astonishing, emotionally a bit of a locked room. I admire it more than I love it.",
  "My dad's copy, then mine. Hard to hear it without hearing a kitchen in 1994 underneath.",
  "Everyone quotes the big track and skips the two that actually hold it together.",
  "Genuinely think the back half is stronger, which appears to be a minority position.",
  "Sounds enormous on a real system and thin on earbuds. Worth finding a room for.",
  "It's fine. I've never understood the reverence and I've given it a decade of chances.",
  "The kind of record that made me go and read about how records get made.",
  "Every year I decide I'm bored of it and every year it wins me back by track three.",
  "Overplayed to the point of invisibility, which is not the album's fault.",
  "First time I heard this I was too young for it. It got better as I got worse.",
  "There's a warmth in the mix here that nobody has convincingly copied since.",
  "Great album, exhausting fanbase, and I say that as one of them.",
  "Put it on at 2am and it stops being a classic and starts being a record again.",
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

  // One album carrying a full page: ten public reviews and five friends-only,
  // so the album window, the sort orders and the full screen all have a
  // realistic amount to work with rather than two or three rows.
  const featured = albums[0];
  const publicAuthors = [...strangers, ...friends].slice(0, 10);
  const friendAuthors = friends.slice(0, 5);
  let featuredCount = 0;

  for (const [i, person] of publicAuthors.entries()) {
    await prisma.albumLog.upsert({
      where: { userId_mbid: { userId: person.id, mbid: featured.mbid } },
      create: {
        userId: person.id, mbid: featured.mbid, albumTitle: featured.albumTitle,
        artistName: featured.artistName, coverUrl: featured.coverUrl,
        itemType: "ALBUM", status: "LISTENED", rating: 7 + (i % 4) * 0.7,
      },
      update: {},
    });
    await saveReview({
      userId: person.id, mbid: featured.mbid,
      body: FEATURED_REVIEWS[i], visibility: "PUBLIC",
    });
    featuredCount += 1;
  }

  // The friends-only five are written by friends who did *not* take a public
  // slot, so the album really does hold fifteen distinct reviews.
  const remainingFriends = friends.filter((f) => !publicAuthors.some((p) => p.id === f.id));
  const friendsOnly = (remainingFriends.length >= 5 ? remainingFriends : friendAuthors).slice(0, 5);
  for (const [i, person] of friendsOnly.entries()) {
    await prisma.albumLog.upsert({
      where: { userId_mbid: { userId: person.id, mbid: featured.mbid } },
      create: {
        userId: person.id, mbid: featured.mbid, albumTitle: featured.albumTitle,
        artistName: featured.artistName, coverUrl: featured.coverUrl,
        itemType: "ALBUM", status: "LISTENED", rating: 8 + (i % 3) * 0.5,
      },
      update: {},
    });
    await saveReview({
      userId: person.id, mbid: featured.mbid,
      body: FEATURED_REVIEWS[10 + i], visibility: "FRIENDS",
    });
    featuredCount += 1;
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
  console.log(`  ${wrote + featuredCount} reviews, ${liked} likes, ${disliked} dislikes`);
  console.log(`  featured: ${featured.albumTitle} (${featured.mbid})`);
  console.log(`            10 public + 5 friends-only, all distinct`);
  await prisma.$disconnect();
})();
