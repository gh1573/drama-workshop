#!/usr/bin/env python3
"""
资产对账工具（docs/architecture-v2.md §10 v2.5 P0-7）。

比对 SQLite 业务表引用与 public/assets 落盘文件，报告三类不一致：
  1. 孤儿文件：磁盘存在但无任何 DB 记录引用（重置库/断点遗留，浪费磁盘与回源带宽）；
  2. 悬空引用：DB 记录指向的文件不存在（产物被误删，渲染/合成会失败）；
  3. 统计摘要：定妆图 / 镜头成片 / 配音 / 成片 / BGM 分类计数与占用。

用法：
  python3 scripts/asset-audit.py          # 只报告，不删除（默认安全）
  python3 scripts/asset-audit.py --gc     # 删除孤儿文件（悬空引用只报告不处理）

退出码：0 = 无孤儿无悬空；1 = 有孤儿或悬空（便于 CI 门禁）；2 = 执行出错。
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

PROJ = Path("/home/z/my-project")
ASSETS = PROJ / "public" / "assets"

# DB 引用列清单：表名 → 引用列（全部按 /assets/ 相对路径存储）
REF_COLUMNS = [
    ("assets", "id", "portraitUrl"),
    ("timeline_clips", "id", "mediaUrl"),
    ("projects", "id", "finalVideoUrl"),
]


def main() -> None:
    ap = argparse.ArgumentParser(description="资产对账（§10 v2.5）")
    ap.add_argument("--gc", action="store_true", help="删除孤儿文件（默认只报告）")
    ap.add_argument("--json", action="store_true", help="以 JSON 输出结果")
    a = ap.parse_args()

    if not ASSETS.exists():
        print(json.dumps({"ok": False, "error": f"资产目录不存在: {ASSETS}"}, ensure_ascii=False))
        sys.exit(2)

    con = sqlite3.connect(PROJ / "db/custom.db")
    cur = con.cursor()
    referenced: set[str] = set()
    dangling: list[dict[str, str]] = []
    for table, pk, col in REF_COLUMNS:
        try:
            rows = cur.execute(
                f'SELECT "{pk}", "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL'
            ).fetchall()
        except sqlite3.OperationalError as e:
            print(json.dumps({"ok": False, "error": f"读取 {table}.{col} 失败: {e}"}, ensure_ascii=False))
            sys.exit(2)
        for row_id, url in rows:
            name = url.removeprefix("/assets/")
            referenced.add(name)
            if not (ASSETS / name).exists():
                dangling.append({"table": table, "id": row_id, "url": url})

    # BGM 素材按项目 id 命名（bgm_{projectId}.*），projIds 存在即视为被引用
    try:
        project_ids = {r[0] for r in cur.execute("SELECT id FROM projects").fetchall()}
    except sqlite3.OperationalError:
        project_ids = set()
    con.close()

    disk_files = sorted(p.name for p in ASSETS.iterdir() if p.is_file())
    orphans = [f for f in disk_files if f not in referenced and not is_bgm_referenced(f, project_ids)]

    by_kind: dict[str, int] = {}
    for f in disk_files:
        kind = f.split("_", 1)[0]
        by_kind[kind] = by_kind.get(kind, 0) + 1
    total_bytes = sum((ASSETS / f).stat().st_size for f in disk_files)

    if a.json:
        print(json.dumps({
            "ok": not orphans and not dangling,
            "diskFiles": len(disk_files),
            "totalMB": round(total_bytes / 1024 / 1024, 1),
            "byKind": by_kind,
            "orphans": orphans,
            "dangling": dangling,
        }, ensure_ascii=False, indent=2))
    else:
        print(f"资产对账（public/assets · {len(disk_files)} 个文件 · {total_bytes/1024/1024:.1f}MB）")
        for kind, n in sorted(by_kind.items()):
            print(f"  {kind:<8} {n}")
        if orphans:
            print(f"\n孤儿文件 {len(orphans)} 个（磁盘存在、无 DB 引用）：")
            for f in orphans:
                print(f"  - {f}")
        else:
            print("\n孤儿文件：无")
        if dangling:
            print(f"\n悬空引用 {len(dangling)} 条（DB 指向的文件不存在）：")
            for d in dangling:
                print(f"  - {d['table']}/{d['id']} → {d['url']}")
        else:
            print("悬空引用：无")

    if orphans and a.gc:
        freed = 0
        for f in orphans:
            p = ASSETS / f
            freed += p.stat().st_size
            p.unlink()
        # 连带清理同名元数据 json（BGM 上传附带）
        print(f"\n--gc 已删除 {len(orphans)} 个孤儿文件，释放 {freed/1024/1024:.1f}MB")

    sys.exit(0 if not orphans and not dangling else 1)


def is_bgm_referenced(name: str, project_ids: set[str]) -> bool:
    if not name.startswith("bgm_"):
        return False
    stem = name[4:].rsplit(".", 1)[0]
    return stem in project_ids


if __name__ == "__main__":
    main()
