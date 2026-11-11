// 诊断：直接用 Prisma client 执行 compose 末尾的同一句 update
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const pid = "cmwbgvcwp000cphteapnd8uaf";
  const p1 = await db.project.findUnique({ where: { id: pid } });
  console.log("before:", { id: p1?.id, finalVideoUrl: p1?.finalVideoUrl, title: p1?.title });
  const p2 = await db.project.update({
    where: { id: pid },
    data: { finalVideoUrl: "/assets/final_cmwbgvcwp000cphteapnd8uaf.mp4" },
  });
  console.log("after:", { id: p2.id, finalVideoUrl: p2.finalVideoUrl });
  // 回滚，保持由 compose 路由正式写入
  await db.project.update({ where: { id: pid }, data: { finalVideoUrl: null } });
  console.log("rolled back to null (compose 路由稍后正式写入)");
}

main()
  .catch((e) => {
    console.error("UPDATE FAILED:");
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
