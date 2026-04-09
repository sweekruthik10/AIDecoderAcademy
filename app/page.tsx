import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Root entry point — skips the marketing landing page entirely.
// Signed-in kids go straight to the dashboard; everyone else is sent to
// sign-in. Clerk's NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL takes over from there.
export default async function RootRedirect() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  redirect("/auth/sign-in");
}
