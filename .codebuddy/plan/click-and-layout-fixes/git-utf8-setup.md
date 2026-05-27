# Git UTF-8 中文 commit 配置（防乱码）

## 已应用的本地配置（worktree 级别）

```bash
git config --local i18n.commitencoding utf-8
git config --local i18n.logoutputencoding utf-8
git config --local core.quotepath false
```

## 验证

```bash
git config --local --list | grep -E "i18n|quotepath"
# 期望输出：
#   core.quotepath=false
#   i18n.commitencoding=utf-8
#   i18n.logoutputencoding=utf-8
```

## 配置说明

| 配置项                   | 作用                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `i18n.commitencoding`    | 设置 commit message 的编码为 UTF-8，避免中文写入 commit 时被本地编码（如 GBK / cp936）转义 |
| `i18n.logoutputencoding` | 设置 `git log` 输出的编码为 UTF-8，避免读取时变成 `\u4xxx` 转义码                          |
| `core.quotepath`         | 关闭 path 中非 ASCII 字符的转义，让中文文件名正常显示                                      |

## 全局推荐（一次配置全机器生效）

如希望整台开发机所有仓库都受益：

```bash
git config --global i18n.commitencoding utf-8
git config --global i18n.logoutputencoding utf-8
git config --global core.quotepath false
```

## 历史 commit 处理策略

- 历史已含 `\u` 转义的 commit message 不修改（避免 force-push 改写历史影响他人）
- 本配置生效后**新 commit** 显示正确，老 commit 仍保留乱码状态作为历史记录

## 适用范围

仅对当前 worktree（`integration/lm-merge-acd`）生效。其他 worktree 如需相同配置，需要在各自工作目录运行同样命令，或使用 `--global` 一次配置。
