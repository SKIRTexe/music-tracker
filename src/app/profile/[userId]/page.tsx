export default async function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <p className="text-zinc-400 text-sm mb-2">User: {userId}</p>
      <p className="text-zinc-400">Listening history coming soon.</p>
    </div>
  );
}
