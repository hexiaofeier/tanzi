# 渠道路由与验证

平台命令、登录要求和上游接口会变化。本文件提供选择与验证方法，不把一次测试结果写成永久事实。`$OUT` 表示本轮 `_raw/` 下的文件；在 PowerShell 中用 `$env:变量名`，在 Bash/zsh 中用 `$变量名`。

落盘编码遵循 `references/setup.md`。Windows PowerShell 5.1 不直接用 `>` 生成待解析的 UTF-8 文件。

## 通用规则

1. 先根据研究问题选 2–4 类来源，不默认遍历全部平台。
2. 查看当前命令帮助，再做一次小结果上限的只读测试。
3. 原始响应与标准错误分别落盘；报告只读回必要字段。
4. 登录不足、扩展断连、超时、零结果和命令不存在分别记录。
5. 降级来源只能补相同证据类型。网页搜索摘要不能冒充帖子正文，热榜不能冒充平台关键词检索。
6. 所有状态超过 30 天或发生错误时重新验证。

## 登录态与账号安全

X / Twitter、小红书、微博、即刻、Reddit、Facebook、Instagram、雪球等平台的搜索、正文、评论或时间线可能依赖浏览器登录态；知乎、B站等也可能临时要求登录或验证。执行前先检查当前命令帮助和登录状态，再做 3—5 条只读测试。

- 建议用户使用专门用于公开信息阅读的低价值小号，不使用承载私人关系、支付信息、企业管理权限或重要历史内容的主账号。
- 小号只是缩小潜在损失，不保证免于限流、验证、账号限制或封禁；不得用小号批量注册或绕过平台治理。
- 用户本人在独立浏览器 Profile 中手动登录。不得读取、导出或索取浏览器 Cookie，不得在输出、日志或 Issue 中记录 Cookie、Token、密码和验证码。
- 默认串行或低并发。出现验证码、`429`、异常登录提醒或风控页面时立即停止该平台，不连续重试，不尝试绕过。
- 只执行读取命令。即使当前适配器暴露发布、评论、点赞、签到等写命令，也不得调用。
- 把未登录、登录过期、风控、扩展断连、超时、零结果分别记录；不能把访问失败写成平台没有相关内容。

## 一、通用网页与新闻

可选路径包括 AnySearch、DuckDuckGo、Google News、RSS 和 Jina Reader。使用前以当前服务说明与命令帮助为准。

```text
opencli duckduckgo search "关键词" --limit 10 -f yaml
opencli google news "关键词" -f yaml
curl -s "https://r.jina.ai/<完整网址>"
```

- 通用搜索适合发现候选和官方来源，不代表已读取平台内完整讨论。
- 用户直接提供网址并要求读正文时，应使用网页读取能力；不要为了遵守检索流程绕远。
- 任何第三方搜索的语言质量、限流和字段都需本轮抽查，不沿用“中文必然不可用”等旧断言。

## 二、中文热点与内容平台

热榜只支持“当前热门话题”证据，不支持某关键词的完整讨论分布。公开热榜接口若可用，可将单源响应落盘；失败时换另一个独立来源，不把共用同一上游的多个榜单当成交叉验证。

常见 OpenCLI 路径如下，具体参数以 `--help` 为准：

| 平台 | 发现 | 正文/详情 | 注意 |
|---|---|---|---|
| 公众号 | `opencli weixin search` | `opencli weixin download` | 搜索链接可能需浏览器解析；旧文失效与工具故障分开记录 |
| 小红书 | `opencli xiaohongshu search` | `opencli xiaohongshu note <完整URL>` | `note` 需要搜索结果中的完整 URL 和 `xsec_token`，不能只传裸 ID |
| 知乎 | `opencli zhihu search` | `question` / `answer` / `download` | 命令与字段按当前帮助验证 |
| 雪球 | `opencli xueqiu search` / `hot` | 详情或评论命令按帮助 | 可能依赖浏览器登录态与平台风控 |
| 36氪 | `opencli 36kr search` | `article` | 媒体内容与用户讨论分开归类 |
| 抖音 | `opencli douyin search` | 按当前帮助 | 视频元数据不等于口播正文或评论观点 |
| B站 | `opencli bilibili search` | `video` / `subtitle` / `comments` | 能否取得字幕取决于视频与当前接口 |
| 微博 | `opencli weibo` 下的当前搜索/热榜命令 | 按当前帮助 | 登录态与页面接口可能变化 |
| 即刻 | `opencli jike search` | `post` / `topic` / `user` | 通常依赖浏览器登录态；只使用只读命令 |

### 公众号正文

一般流程是“搜索候选 → 浏览器解析真实文章链接 → 下载 Markdown”。具体浏览器会话和下载参数先查：

```text
opencli weixin --help
opencli browser --help
```

搜狗跳转失败、文章已删除、公众号迁移和下载命令失败是四种不同状态。公众号阅读量、在看数或评论若当前公开路径无法取得，填 `—`，不通过抓包、证书或代理绕取。

### 小红书正文

当前优先验证免费路径：

```text
opencli xiaohongshu search "关键词" --limit 5 -f yaml
opencli xiaohongshu note "<搜索结果中的完整URL，含xsec_token>" -f yaml
```

成功时可取得正文与互动字段；失败时保留错误并标明本轮覆盖缺口。不得再使用“OpenCLI 只有标题、没有单篇正文命令”作为固定规则。

## 三、英文社区

| 平台 | 发现/读取 | 边界 |
|---|---|---|
| Reddit | 优先验证 `opencli reddit search/read`；必要时使用公开 RSS | 排序分数不是相关度，RSS 无法代表全部内容 |
| Hacker News | Algolia 搜索 API或 `opencli hackernews` | 帖子、评论和外链文章是不同材料 |
| Bluesky | 当前公开接口或经用户授权的应用密码 | 适合观点样本，不适合直接判断总体热度 |
| Stack Overflow / Lobsters / dev.to / Substack | 对应 OpenCLI 命令或站点公开接口 | 平台人群与内容类型需写入证据边界 |

不要写“某个内部引擎也使用同一接口”之类只有作者知道的说明；只记录本 Skill 自己的接口依赖与失效风险。

## 四、V2EX

OpenCLI 1.8.6 当前提供 `v2ex hot`、`latest`、`node`、`topic`、`replies`、`member` 等命令，但没有 `v2ex search`。因此按任务类型路由：

```text
# 热门、最新或明确节点：直接读 V2EX
opencli v2ex hot --limit 10 -f yaml
opencli v2ex latest --limit 10 -f yaml
opencli v2ex node python --limit 10 -f yaml

# 已知主题 ID：读取正文与回复
opencli v2ex topic <主题ID> -f yaml
opencli v2ex replies <主题ID> -f yaml

# 关键词发现：交给通用搜索，再读取主题
site:v2ex.com/t/ 关键词
```

站点限定搜索是外部搜索引擎的收录结果，不是 V2EX 原生全文检索。它可能漏掉新帖、旧帖和未收录页面；零结果只能标记“本轮未检出”。节点浏览适合补充近期讨论，但不能冒充全站关键词检索。

[V2EX 官方 API 2.0](https://www.v2ex.com/help/api) 当前公开的读取范围包括节点主题、指定主题和主题回复，没有列出全文关键词搜索接口。接口范围发生变化时，先看当前官方文档与 `opencli v2ex --help`，再更新本节。

## 五、X / Twitter

OpenCLI 当前可能提供 `twitter search`、`tweets`、`article`、`thread` 等只读命令，依赖浏览器扩展、X 登录态、网络和页面接口。

```text
opencli twitter search --help
opencli twitter search "关键词" --limit 3 -f yaml --trace retain-on-failure
```

最小测试成功后再扩大条数。失败时只声明“本次环境/当前时点不可用”，并记录属于：无命令、扩展断连、登录不足、超时、X 接口变化或零结果。普通网页搜索可用于发现 X 链接，但不能替代推文正文和互动数据。

只读采集，不访问不必要的 followers/following，不使用主账号进行高频自动化，不导出 Cookie。

## 六、学术、产品、代码与视频

| 类型 | 推荐路径 | 验证点 |
|---|---|---|
| 学术 | arXiv RSS/API、OpenAlex、OpenReview、Google Scholar | 标题、摘要、作者、日期、正式版本与引用口径 |
| 模型 | Hugging Face 模型/数据集/论文页面 | 卡片内容与实际性能证据分开 |
| 产品 | Product Hunt、Techmeme、官方发布页 | 发布热度不等于使用量或收入 |
| 代码 | `gh search repos` / `gh search issues` | Stars、更新时间、许可证、仓库活跃度 |
| YouTube | `yt-dlp` 元数据/字幕或 OpenCLI | 元数据、字幕、评论分别标明；不默认下载媒体 |

查询参数必须进行 URL 编码。学术 API 的匿名限流和密钥额度是实时状态，失败后选择另一独立来源并说明覆盖差异。

## 七、速率与失败恢复

- 默认串行或低并发，只对独立公共接口做有限并发。
- 平台出现验证码、429 或风控提示时停止该平台，不尝试绕过。
- 同一命令最多重试一次；第二次仍失败就走已知降级或记录缺口。
- 对页面模板或未公开内部端点的解析属于脆弱路径，要在报告中注明，不能称为稳定 API。
