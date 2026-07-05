import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3 text-sm">
        <nav className="flex gap-4">
          <Link href="/today">Today</Link>
          <Link href="/list">List</Link>
          <Link href="/board">Board</Link>
          <Link href="/calendar">Calendar</Link>
        </nav>
        <span className="text-muted-foreground">{session.user.email}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
