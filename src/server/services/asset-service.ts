import { db } from "@/lib/db";
import { RouteError } from "@/lib/api-utils";
import type {
  AssetDTO,
  AssetKind,
  ShotRefDTO,
  VoiceProfile,
} from "@/lib/drama";
import { anchorFingerprint } from "@/server/engines/prompt-engine";
import type { Prisma, Asset, ShotRef } from "@prisma/client";

/**
 * 资产服务 —— 一致性锚定的业务核心。
 *
 * 锚定语义（docs/architecture-v2.md §7.1）：
 * 1. lockedAppearance / visualAnchor 定稿即冻结；
 * 2. 改锚点必须显式「解冻确认」（confirmUnfreeze），
 *    确认后：绑定镜头 promptVersion 置空（标「锚点过期」）并回置待生成；
 * 3. 锚点指纹失配可计算 —— 哪些镜头受资产改动影响不再是猜测。
 */

const KINDS: AssetKind[] = ["character", "scene", "prop"];

function parseVoiceProfile(raw: string | null): VoiceProfile | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceProfile;
  } catch {
    return null;
  }
}

function mapAsset(row: Asset, refCount: number): AssetDTO {
  return {
    id: row.id,
    kind: row.kind as AssetKind,
    name: row.name,
    lockedAppearance: row.lockedAppearance,
    visualAnchor: row.visualAnchor,
    voiceProfile: parseVoiceProfile(row.voiceProfile),
    portraitUrl: row.portraitUrl,
    source: (row.source as "crew" | "manual") ?? "crew",
    refCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRef(row: ShotRef & { asset: Asset }): ShotRefDTO {
  return {
    id: row.id,
    clipId: row.shotId,
    assetId: row.assetId,
    kind: row.asset.kind as AssetKind,
    assetName: row.asset.name,
    stateNote: row.stateNote,
  };
}

export async function listAssets(projectId: string): Promise<AssetDTO[]> {
  await requireProject(projectId);
  const [rows, refCounts] = await Promise.all([
    db.asset.findMany({
      where: { projectId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    }),
    db.shotRef.groupBy({
      by: ["assetId"],
      where: { asset: { projectId } },
      _count: { id: true },
    }),
  ]);
  const countMap = new Map(refCounts.map((r) => [r.assetId, r._count.id]));
  return rows.map((r) => mapAsset(r, countMap.get(r.id) ?? 0));
}

async function requireProject(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId } });
  if (!p) throw new RouteError("项目不存在或已被删除", 404);
  return p;
}

export async function createAsset(
  projectId: string,
  input: {
    kind: AssetKind;
    name: string;
    lockedAppearance: string;
    visualAnchor: string;
    voiceProfile?: VoiceProfile | null;
  }
): Promise<AssetDTO> {
  await requireProject(projectId);
  if (!KINDS.includes(input.kind)) {
    throw new RouteError("资产类型必须是 character / scene / prop", 422);
  }
  const exists = await db.asset.findUnique({
    where: { projectId_kind_name: { projectId, kind: input.kind, name: input.name } },
  });
  if (exists) {
    throw new RouteError(`同名资产已存在：${input.kind === "character" ? "角色" : input.kind === "scene" ? "场景" : "道具"}「${input.name}」`, 409);
  }
  const row = await db.asset.create({
    data: {
      projectId,
      kind: input.kind,
      name: input.name.trim(),
      lockedAppearance: input.lockedAppearance.trim(),
      visualAnchor: input.visualAnchor.trim(),
      voiceProfile: input.voiceProfile ? JSON.stringify(input.voiceProfile) : null,
      source: "manual",
    },
  });
  return mapAsset(row, 0);
}

export interface AssetPatch {
  lockedAppearance?: string;
  visualAnchor?: string;
  voiceProfile?: VoiceProfile | null;
  name?: string;
}

/**
 * 更新资产（锚点解冻保护）。
 * - 仅改音色档案（voiceProfile）不触发解冻流程；
 * - 改 lockedAppearance / visualAnchor 且已有镜头引用了组装产物：
 *   未携带 confirmUnfreeze → 409 并返回受影响镜头数；
 *   携带 confirmUnfreeze → 绑定镜头 promptVersion 置空、状态回置 pending。
 */
export async function updateAsset(
  assetId: string,
  patch: AssetPatch,
  confirmUnfreeze = false
): Promise<AssetDTO & { unfrozeClipIds: string[] }> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { refs: { include: { shot: true } } },
  });
  if (!asset) throw new RouteError("资产不存在或已被删除", 404);

  const anchorChanged =
    (patch.lockedAppearance !== undefined &&
      patch.lockedAppearance.trim() !== asset.lockedAppearance) ||
    (patch.visualAnchor !== undefined &&
      patch.visualAnchor.trim() !== asset.visualAnchor);

  const anchoredShots = asset.refs
    .map((r) => r.shot)
    .filter((s) => s.finalPrompt != null);

  if (anchorChanged && anchoredShots.length > 0 && !confirmUnfreeze) {
    throw new RouteError(
      `该资产已被 ${anchoredShots.length} 个镜头的提示词锚定，修改外观会触发这些镜头「锚点过期」。请确认解冻后重试。`,
      409,
      JSON.stringify({ affectedClipIds: anchoredShots.map((s) => s.id) })
    );
  }

  const data: Prisma.AssetUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.lockedAppearance !== undefined)
    data.lockedAppearance = patch.lockedAppearance.trim();
  if (patch.visualAnchor !== undefined)
    data.visualAnchor = patch.visualAnchor.trim();
  if (patch.voiceProfile !== undefined)
    data.voiceProfile = patch.voiceProfile
      ? JSON.stringify(patch.voiceProfile)
      : null;

  const unfrozeClipIds: string[] = [];
  await db.$transaction(async (tx) => {
    if (anchorChanged && anchoredShots.length > 0) {
      for (const shot of anchoredShots) {
        await tx.timelineClip.update({
          where: { id: shot.id },
          data: { promptVersion: null, status: "pending" },
        });
        unfrozeClipIds.push(shot.id);
      }
    }
    await tx.asset.update({ where: { id: assetId }, data });
  });

  const fresh = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  return { ...mapAsset(fresh, asset.refs.length), unfrozeClipIds };
}

export async function deleteAsset(assetId: string): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new RouteError("资产不存在或已被删除", 404);
  // ShotRef 级联删除；引用镜头的 finalPrompt 保留，但指纹将失配 → 标过期
  await db.asset.delete({ where: { id: assetId } });
}

/** 镜头绑定资产（同一项目内；重复绑定幂等返回既有引用） */
export async function bindRef(
  clipId: string,
  assetId: string,
  stateNote?: string | null
): Promise<ShotRefDTO> {
  const clip = await db.timelineClip.findUnique({
    where: { id: clipId },
    include: { project: true },
  });
  if (!clip) throw new RouteError("镜头不存在或已被删除", 404);
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.projectId !== clip.projectId) {
    throw new RouteError("资产不存在或不属于该项目", 404);
  }
  const exists = await db.shotRef.findUnique({
    where: { shotId_assetId: { shotId: clipId, assetId } },
    include: { asset: true },
  });
  if (exists) return mapRef(exists);
  const row = await db.shotRef.create({
    data: { shotId: clipId, assetId, stateNote: stateNote?.trim() || null },
    include: { asset: true },
  });
  return mapRef(row);
}

export async function unbindRef(refId: string): Promise<void> {
  const ref = await db.shotRef.findUnique({ where: { id: refId } });
  if (!ref) throw new RouteError("引用关系不存在", 404);
  await db.shotRef.delete({ where: { id: refId } });
}

export async function listRefs(projectId: string): Promise<ShotRefDTO[]> {
  const rows = await db.shotRef.findMany({
    where: { shot: { projectId } },
    include: { asset: true },
  });
  return rows.map(mapRef);
}

/**
 * 计算锚点已过期的镜头：
 * 镜头存在 promptVersion（非 null、非 manual）时，用当前绑定资产重算指纹，
 * 失配（含资产被删除导致锚点缺失）即过期。
 */
export async function computeStaleClipIds(projectId: string): Promise<string[]> {
  const [clips, refs, project] = await Promise.all([
    db.timelineClip.findMany({
      where: { projectId, promptVersion: { not: null } },
      select: { id: true, promptVersion: true },
    }),
    db.shotRef.findMany({
      where: { shot: { projectId } },
      select: { shotId: true, assetId: true },
    }),
    db.project.findUnique({
      where: { id: projectId },
      select: { tonePrompt: true },
    }),
  ]);
  if (!project || clips.length === 0) return [];

  const anchors = await db.asset.findMany({
    where: { projectId },
    select: { id: true, visualAnchor: true },
  });
  const anchorById = new Map(anchors.map((a) => [a.id, a.visualAnchor]));
  const refsByClip = new Map<string, string[]>();
  for (const r of refs) {
    const list = refsByClip.get(r.shotId) ?? [];
    list.push(r.assetId);
    refsByClip.set(r.shotId, list);
  }

  const stale: string[] = [];
  for (const clip of clips) {
    if (clip.promptVersion === "manual") continue;
    const assetIds = refsByClip.get(clip.id) ?? [];
    const current = anchorFingerprint(
      assetIds
        .map((id) => anchorById.get(id))
        .filter((a): a is string => !!a)
        .map((visualAnchor) => ({ visualAnchor })),
      project.tonePrompt
    );
    if (current !== clip.promptVersion) stale.push(clip.id);
  }
  return stale;
}
