# 环境准备

部分平台依赖外部程序、浏览器扩展或登录态。首次使用时主动检查本次任务需要的工具；发现缺失后说明用途、影响范围和准确安装命令，取得用户同意后协助安装并复检。只安装本次任务实际需要的工具。

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
| OpenCLI | 浏览器会话复用及多个中文、社区平台的只读采集 | `npm install -g @jackwener/opencli@latest` |
| OpenCLI 浏览器扩展 | 让 OpenCLI 使用浏览器中已有且用户有权使用的登录态 | 按 OpenCLI 当前官方文档安装；安装后用 `opencli doctor` 验证 |
| GitHub CLI | GitHub 仓库、Issue、PR 检索 | Windows：`winget install --id GitHub.cli`；认证仅在当前任务需要时进行 |
| yt-dlp | YouTube 元数据或字幕获取 | Windows：`winget install yt-dlp.yt-dlp`；也可使用官方支持的包管理方式 |

缺少工具时，先说明它会影响哪些渠道，并提供不安装时的有限降级路径。不得把“安装是默认动作”理解为无需用户许可直接修改系统。

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
