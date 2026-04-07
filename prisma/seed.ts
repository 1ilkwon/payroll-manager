import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin1234", 10);

  await prisma.user.upsert({
    where: { loginId: "admin" },
    update: {},
    create: {
      name: "관리자",
      loginId: "admin",
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log("✅ Seed complete: admin / admin1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
