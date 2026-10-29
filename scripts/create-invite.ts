// Usage: npm run invite -- [email] [--days=14]
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--")) ?? null;
const days = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 14);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const code = randomBytes(6).toString("base64url");
const { error } = await db.from("invites").insert({
  code,
  email: email?.toLowerCase() ?? null,
  expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Invite code: ${code}${email ? ` (for ${email})` : ""}, expires in ${days} days`);
