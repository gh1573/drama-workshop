#!/usr/bin/env bash
# 一次性维护脚本：将历史上的 UUID 提交信息改写为有意义的里程碑描述
# 仅使用 --msg-filter 改写 message，所有 tree/blob 内容保持原样，不影响文件完整性
set -euo pipefail
cd /home/z/my-project

FILTER='
case "$GIT_COMMIT" in
  c5161d0*) echo "chore: 添加参考平台界面截图素材";;
  457151d*) echo "feat: 项目脚手架与 shadcn/ui 组件库初始化";;
  8a42440*) echo "feat: 工作台 v1 界面与运行服务(run-service)骨架";;
  b9a1700*) echo "feat: 节拍分镜拆解(breakdown)与工作台面板迭代";;
  0318f07*) echo "feat: v2 架构落地——AI 通道 provider 体系与四层配置中心";;
  1e70c08*) echo "feat: AI 剧组流水线六阶段面板与锚定/生成接口";;
  4ce41bd*) echo "refactor: 零硬编码整改——运行参数与模板集中至 src/config";;
  fdfec1a*) echo "feat: 端到端试跑——首集与系列流水线脚本及批量生成资产";;
  dce9292*) echo "feat: 多剧集(series)批量渲染接口与视频/语音通道接入";;
  b560014*) echo "feat: 第一集端到端跑通——成片合成与架构文档 v2.1";;
  *) cat;;
esac'

git filter-branch -f --msg-filter "$FILTER" -- --all

# 清理 filter-branch 的备份引用
git update-ref -d refs/original/refs/heads/main 2>/dev/null || true
git reflog expire --expire=now --all
git gc --prune=now --quiet
