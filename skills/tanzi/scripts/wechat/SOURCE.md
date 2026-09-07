# 本地公众号采集适配器

- 上游：[tjx666/wx-search-cli](https://github.com/tjx666/wx-search-cli)，版本 0.1.0；本次核对 main 提交 `70b75b71384b4bcfce86be744b685f02f9440c16`（2026-09-06）。原搜狗方案及 URL 解析方法来自 `fancyboi999/weixin_search_mcp`。
- 采用并修改上游的搜狗请求、跳转字符串解析和正文文本提取方法，MIT 全文见本目录 LICENSE。本地适配器版本 1.0.0，不声称是上游发布版本。
- 修正：按单条搜索结果配对日期；请求前限量；缺日期保留；空正文、结构变化、验证码和 HTTP 错误明确返回；每次请求串行间隔至少 1 秒、15 秒超时、无重试。
- 浏览器与个人微信凭证不参与。搜狗搜索响应发放的匿名会话 Cookie 仅留在本次调用内存里，只发送到同一个 HTTPS 搜狗来源；不输出 Cookie、不执行远端 JavaScript。所有 HTTP 跳转手工校验，外部主机、认证 URL 和异常端口不接受。
- 文章 URL 保留定位参数（包括搜狗签名定位所需的 src/timestamp/ver/signature），删除 uin/key/pass_ticket/token 等无关认证参数。搜狗链接保留其正常跳转定位参数；不要自行把个人凭证拼到输入 URL。
- 可选账号发现只借鉴 `WupfAGI/wechat-search-skill` 的“由命中文章发现公众号”思路，自行实现按显示名聚合；未复制其代码。结果标记 `identity_unverified`，包含命中文章及查询，不代表已核验唯一账号或取得账号全部历史。
- 安装：本目录执行 `npm ci --ignore-scripts --no-audit --no-fund`（首次没有锁文件时使用 `npm install`）。固定 `cheerio=1.2.0`；Node >=20.19.0。`npm test` 只运行 mock fetch 回归测试，不发真实网络请求。命令契约见 `node cli.mjs --help`。
- `success` 仅说明本次设定范围内成功；`zero_result` 仅用于页面明确声明无结果；`partial` 保留中止前已得内容，须查 errors/coverage；风控、限流、登录需求均立即停止。搜索不会自动读取正文，不保证搜狗索引覆盖、结果时效或历史完整性。已知日期只是源页显示时间，未知和无法解析的时间均不猜测。
