/** 从种子项目任务记录实测各阶段真实耗时（诚实耗时预期的数据来源） */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const tasks = await db.renderTask.findMany({
  where: { project: { title: { contains: "演示第一集" } } },
  select: { kind: true, status: true, createdAt: true, updatedAt: true },
  orderBy: { createdAt: "asc" },
});
const byKind = {};
for (const t of tasks) {
  if (t.status !== "succeeded") continue;
  const dur = (t.updatedAt - t.createdAt) / 1000;
  if (!byKind[t.kind]) byKind[t.kind] = [];
  byKind[t.kind].push(dur);
}
for (const [kind, durs] of Object.entries(byKind)) {
  const total = durs.reduce((a, b) => a + b, 0);
  console.log(
    `${kind}: n=${durs.length} 均值=${(total / durs.length).toFixed(0)}s 最大=${Math.max(...durs).toFixed(0)}s 合计=${(total / 60).toFixed(1)}min`
  );
}
const all = tasks.map((t) => (t.updatedAt - t.createdAt) / 1000);
const span = (tasks[tasks.length - 1].updatedAt - tasks[0].createdAt) / 60000;
console.log(`\n任务总数=${tasks.length} 全程跨度=${span.toFixed(1)}min`);
await db.$disconnect();
