# tanzi

tanzi 是一个面向 Claude Code、Codex、WorkBuddy 等兼容 Agent Skills 的智能代理的公开信息采集 Skill。它围绕明确话题选择必要的平台与来源，交付可追溯的候选清单、精选正文和采集报告。

## 能做什么

- 采集中文内容平台、海外社区、新闻、论文、代码仓库和产品资料。
- 获取当前工具能够读取的帖子或文章正文，并明确标记只有标题、摘要或互动数据的材料。
- 记录实际关键词、来源、时间、链接、失败与降级路径。
- 区分事实、公开讨论、传播信号和推断，避免把社区样本当成总体统计。

## 不做什么

- 不撰写可直接发布的公众号稿、研究报告正文或营销文案。
- 不发帖、评论、点赞、收藏、关注或执行其他平台写操作。
- 不导出 Cookie，不读取或回显 API Key，不修改代理、证书或抓包配置。
- 不调用按次付费 API。

## 安装

将 [`skills/tanzi`](skills/tanzi/) 文件夹复制到客户端的 Skill 目录，确保安装后的结构是 `<Skill 目录>/tanzi/SKILL.md`：

- Claude Code：`~/.claude/skills/tanzi`
- Codex：`~/.agents/skills/tanzi`；部分现有安装也会读取 `~/.codex/skills/tanzi`
- WorkBuddy：`~/.workbuddy/skills/tanzi`

安装后新开会话。Claude Code 使用 `/tanzi`，Codex 使用 `$tanzi`；其他客户端可在 Skill 列表中选择 `tanzi`。自动触发范围以 [`SKILL.md`](skills/tanzi/SKILL.md) 的 `description` 为准。

## 外部依赖

中文内容平台和 X 等主要渠道通常需要 Node.js、OpenCLI、浏览器扩展及相应平台登录态；GitHub 或视频渠道可能需要 GitHub CLI、yt-dlp。首次调用时，tanzi 会先检查本次任务需要的依赖，解释安装用途和命令，并在获得同意后协助安装和复检。

安装外部程序、登录平台或修改配置前，代理必须获得用户同意。详见 [`references/setup.md`](skills/tanzi/references/setup.md)。

## 当前重要路径

- X/Twitter：优先验证 OpenCLI 的只读 `twitter search`。
- 小红书：先搜索，再把包含 `xsec_token` 的完整结果 URL 交给 `xiaohongshu note`。
- 平台能力会变化：查看当前帮助并做小结果上限的只读测试，不能把一次失败写成永久结论。

## 输出

默认输出包括：

- `00_采集报告.md`
- `01_清单.md`
- `正文/`
- `_raw/`

如果项目已有文件命名或存放规则，以项目规则为先。

## 许可证

MIT，见 [LICENSE](LICENSE)。第三方网站、平台内容和命令行工具仍受各自条款约束。
