import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  password: string | null;
}

// Ambil user dari tabel public.users
async function getUsersFromPublicUsers(): Promise<PublicUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  if (error) {
    console.error("Error fetching public.users:", error);
    process.exit(1);
  }

  return data!;
}

// Membuat user baru di auth.users memakai service_role key
async function createAuthUser(email: string, password: string | null) {
  // Supabase tidak bisa membuat user menggunakan password hash.
  // Jadi kita berikan password temporary saja.
  const tempPassword = password ?? "Temp@123456";

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (error) {
    console.error("Error creating auth user:", error);
    return null;
  }

  return { authUser: data, tempPassword };
}

async function run() {
  console.log("Fetching users from public.users...");
  const users = await getUsersFromPublicUsers();

  console.log(`Found ${users.length} users.`);
  const results: any[] = [];

  for (const u of users) {
    console.log(`Migrating: ${u.email}`);

    const res = await createAuthUser(u.email, u.password);

results.push({
  public_id: u.id,
  email: u.email,
  temp_password: res?.tempPassword ?? null,
  auth_user_id: res?.authUser.user?.id ?? null,
});

  }

  console.log("\nMigration result:");
  console.table(results);

  console.log("\nUsers migrated to Supabase Auth!");
  console.log("Tell users to reset password or use tempPassword.");
}

run();
