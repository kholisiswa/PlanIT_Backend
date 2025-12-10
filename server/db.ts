// ...import eq, drizzle, Pool, InsertUser, users, ENV...

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  const now = new Date();

  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? now,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : undefined),
  };

  const updateSet = {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: user.lastSignedIn ?? now,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : undefined),
  };

  // Jika email sudah ada (misal user register manual lalu login Google),
  // perbarui baris lama dan tambahkan openId ke baris tersebut.
  if (values.email) {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(eq(users.email, values.email))
      .limit(1);

    if (existingByEmail[0]) {
      await db
        .update(users)
        .set({
          ...updateSet,
          openId: values.openId,
        })
        .where(eq(users.id, existingByEmail[0].id));
      return;
    }
  }

  // Jika belum ada, insert; jika openId sudah ada, update data
  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
}
