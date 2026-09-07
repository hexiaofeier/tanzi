# 环境准备

部分平台依赖外部程序、浏览器扩展或登录态。首次使用时主动检查本次任务需要的工具；发现缺失后说明用途、影响范围和准确安装命令，确认已有授权或取得用户同意后协助安装并复检。只安装本次任务实际需要的工具。

## 跨平台自检

先用当前 shell 的命令发现机制检查：

- PowerShell：`Get-Command opencli, gh, yt-dlp -ErrorAction SilentlyContinue`
- Bash/zsh：`command -v opencli gh yt-dlp`

再按需运行：

```text
node --version
opencli --version
opencli doctor
gh --version
yt-dlp --version
```

不要在一个长脚本里吞掉所有错误。逐项记录“已安装/缺失/命令超时/浏览器扩展断连/缺少平台登录态”。

### Windows PowerShell 5.1 编码

PowerShell 5.1 用 `>` 接收外部命令时通常写成 UTF-16 LE，不能再假设文件是 UTF-8。需要给 YAML/JSON 解析器读取时，改用：

```powershell
opencli twitter search "关键词" --limit 3 -f yaml |
  Out-File -LiteralPath $outPath -Encoding utf8
```

Python/PyYAML 用二进制方式打开可自动识别 BOM：`yaml.safe_load(open(path, "rb"))`。PowerShell 7、Bash/zsh 也要以实际文件编码为准，不凭扩展名猜测。

## 工具与用途

| 工具 | 用途 | 安装说明 |
|---|---|---|
| Node.js | OpenCLI 运行时；版本要求以当前 OpenCLI 官方说明为准 | Windows 可用 `winget install OpenJS.NodeJS.LTS`；其他系统用官方 LTS |
| wx-search-cli 本地修正版 | 公众号匿名搜索、原文地址解析、正文读取 | 脚本附带于本技能；Node.js >=20.19，按下文安装锁定依赖 |
| OpenCLI | 浏览器会话复用及多个中文、社区平台的只读采集 | `npm install -g @jackwener/opencli@latest` |
| OpenCLI 浏览器扩展 | 让 OpenCLI 使用浏览器中已有且用户有权使用的登录态 | 按 OpenCLI 当前官方文档安装；安装后用 `opencli doctor` 验证 |
| GitHub CLI | GitHub 仓库、Issue、PR 检索 | Windows：`winget install --id GitHub.cli`；认证仅在当前任务需要时进行 |
| yt-dlp | YouTube 元数据或字幕获取 | Windows：`winget install yt-dlp.yt-dlp`；也可使用官方支持的包管理方式 |

缺少工具时，先说明它会影响哪些渠道，并提供不安装时的有限降级路径。不得把“安装是默认动作”理解为无需用户许可直接修改系统。

## 公众号脚本依赖

先将 `$skillDir` 设为本次实际读取到的 tanzi 目录。用户已授权安装或更新时执行：

```powershell
npm ci --prefix "$skillDir/scripts/wechat" --ignore-scripts --no-audit --no-fund
node "$skillDir/scripts/wechat/cli.mjs" --version
node "$skillDir/scripts/wechat/cli.mjs" --help
node --test "$skillDir/scripts/wechat/collector.test.mjs"
```

只安装脚本目录内的锁定依赖，不全局安装 wx-search-cli，不改浏览器、代理或凭证配置。脚本仅依赖 Node.js 和本地解析库，公众号匿名路径不需要 OpenCLI、浏览器扩展或登录；网络验证方法和状态见 [公众号采集](wechat.md)。回归测试使用模拟页面，不等于线上可用性测试。

## 可选凭证

凭证文件由 `TANZI_ENV_FILE` 指定；未设置时才查看用户目录下的 `.tanzi-env`。可选变量：

| 变量 | 用途 |
|---|---|
| `ANYSEARCH_API_KEY` | 在该服务当前仍支持匿名/密钥模式时提高额度 |
| `BSKY_HANDLE` + `BSKY_APP_PASSWORD` | Bluesky 需要认证的读取路径；只用可撤销的应用密码 |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar 可选增强；缺失时使用其他学术来源 |

只检查变量是否存在，不打印值。服务额度、申请方式和认证规则属于易变信息，使用前查当前官方说明，不能把历史额度写成保证。

## 平台最小验证

工具存在不等于平台可用。对本次需要的平台：

1. 查看对应 `--help`，确认命令和参数仍存在。
2. 运行一次小结果上限的只读测试。
3. 记录成功条数、耗时或明确错误。
4. 登录不足时请用户自行在浏览器完成登录；不要导出或读取 Cookie。

安装完成后重新执行相同检查。不要仅凭配置文件或扩展已安装就宣称采集成功。

## 分层验证与命令兼容

只对本次所需渠道记录状态；未做内容请求时填“未验证”：

| 层次 | 核验方式 | 能证明什么 |
|---|---|---|
| 工具 | 命令发现、版本与具体帮助 | 已安装且命令存在 |
| 桥接 | opencli doctor 的连接结果 | 浏览器连接条件，不代表平台登录成功 |
| 登录 | 必要时运行平台只读 whoami | 当前会话身份，不代表目标字段可取 |
| 内容 | 一次 3—5 条或一个目标的只读请求 | 本次条目、字段、非空正文与实际覆盖 |

Agent Reach 仅作可选参考。`active_backend: null` 不等于未安装，非空也不等于正文已取到，报告须写具体验证层次。预检只查命令、描述和与任务相关的显式配置，不自动展开所有客户端配置、扫描浏览器凭证或启动付费取数。

- Windows 的 npm 脚本入口或子进程解析异常时，先发现 `opencli.cmd` / `mcporter.cmd` 实际路径。含 `&` 的完整 URL 不经 `.cmd` / `cmd.exe` 转发：批处理入口仍可能把查询参数拆成命令，即使用参数数组也不能据此认定安全。OpenCLI 改用下面的 Node.js 入口；Python 子进程同样传 `[node路径, JS入口, ...参数]`，不用 `shell=True` 拼接。中文输出按 UTF-8 解码；PowerShell 中 curl 示例使用已发现的 `curl.exe`，避免别名误用。
- 参数按当前 shell 引用，URL 查询参数正确编码；机密不得进入命令回显或日志。PowerShell 5.1 向 Python 管道传中文代码或文本时，还需设置 `$OutputEncoding` 为 UTF-8；只设控制台输出编码并不足够。
- 预检建议 30 秒超时，最小内容请求建议 60 秒，可按任务调整并说明。超时不记为零结果；终止只限本轮启动的进程，不批量结束用户浏览器或所有同名进程。
- Windows 创建后台辅助进程使用隐藏窗口；交互登录由用户本人完成。
- yt-dlp 经 Python 包安装时参考 `python -m pip install -U "yt-dlp[default]"`；已通过 winget、uv、pipx 或虚拟环境安装则沿用原方式。缺少 JS 运行时或组件时报告具体缺项，不把版本命令成功当作字幕成功。

### Windows 完整 URL 的 OpenCLI 入口

以下适用于 npm 全局安装，入口从当前安装包读取，不硬编码用户名或版本。`$noteUrl` 应直接取自解析后的搜索 JSON，不手工拆分、删改查询参数。

```powershell
$opencliCmd = (Get-Command opencli.cmd -ErrorAction Stop).Source
$opencliPackage = Join-Path (Split-Path -Parent $opencliCmd) 'node_modules/@jackwener/opencli'
$opencliManifest = Get-Content -LiteralPath (Join-Path $opencliPackage 'package.json') -Encoding utf8 -Raw | ConvertFrom-Json
$opencliMain = Join-Path $opencliPackage $opencliManifest.bin.opencli
if (-not (Test-Path -LiteralPath $opencliMain -PathType Leaf)) { throw 'OpenCLI JavaScript entry was not found; inspect this installation.' }
node $opencliMain xiaohongshu note $noteUrl -f json --trace off
```

2026-09-06 实测发现 `.cmd` 调用将 `&xsec_source=...` 拆成额外命令；直接 Node.js 入口消除了该拆分错误，但同一笔记仍返回 `Navigation rejected.`。后续对照使用同一会话、新建专用标签页，成功读取该笔记 310 字符文字正文和 3 条一级评论；补充入口见 [小红书正文](channels.md#小红书正文)。原有 `tabs.update` 导航失败的底层原因未确定，不能将其归因为未登录、平台风控或笔记删除。不改安全策略、不自动打开可能包含会话数据的 trace。

2026-09-07 再测同一笔记：直接 Node.js 启动原生 `note` 命令成功，取得 310 字符；原生 `comments` 命令仍报同一导航错误。未修改 OpenCLI 或使用补充入口；以上为分别验收的状态，不作“原生命令全部故障”或“全部恢复”的推断。

## 依赖更新与验证记录

维护时记录工具版本、来源提交（可得时）、核验日期和核验层次。同一版本号下主分支也可能修复代码或文档，不能只比较版本字符串。普通采集不顺带升级环境；已有更新授权时，检查依赖占用，停止本轮启动的旧探测进程，再更新已安装且相关的组件，之后复检版本和受影响命令。

不自动安装全部可选后端，不删除用户已有旧工具，不擅自改代理、证书或登录配置。是否保留备份依用户要求，明确不留时不创建备份副本。维护多个 Skill 包时同步共同免费说明，各自携带所需文档，保持独立运行。
