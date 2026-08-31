/**
 * Someone's picture, or their initials.
 *
 * Initials rather than a generic silhouette: in a list of friends the point is
 * telling people apart, and a column of identical grey heads does the opposite.
 */
export function Avatar({
  name,
  handle,
  image,
  size = 40,
}: {
  name?: string | null;
  handle?: string | null;
  image?: string | null;
  size?: number;
}) {
  const label = name || handle || "?";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-zinc-800"
      style={{ width: size, height: size }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="font-semibold text-zinc-500"
            style={{ fontSize: Math.max(10, size * 0.36) }}
          >
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}
