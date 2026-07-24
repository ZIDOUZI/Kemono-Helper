# Kemono-Helper / Kemono助手

为 Kemono 提供更好的使用体验。

## 功能

- 在作者、帖子、收藏页加入**批量下载**功能，通过 Aria2 实现
- 键盘导航：支持**左右方向键**翻页，**Vim 模式** (h/l) 导航
- 自动**替换帖子内容中的外部链接**为站内链接

## 使用方法

### 批量下载

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或其他用户脚本管理器
2. 安装本脚本
3. 安装 [Motrix](https://motrix.app/) 或 [Aria2NG](https://github.com/mayswind/AriaNg)，确保 Aria2 RPC 服务已启动
4. 访问 kemono 作者页/帖子页/收藏页，点击**下载按钮**
5. 首次使用请点击**齿轮按钮**进行设置：
   - **Motrix**: RPC 地址填写 `http://localhost:16800/jsonrpc`
   - **Aria2NG**: RPC 地址填写 `http://localhost:6800/jsonrpc`
   - 如自行修改过端口，按实际情况填写
   - Token 留空即可（除非自行设置了 token）

### 下载路径自定义

设置 RPC 后将自动获取 Aria2 默认下载路径。支持以下占位符：

| 占位符 | 说明 |
|---------|------|
| `{service}` | 服务器，如 `fanbox` |
| `{artist_id}` | 作者 ID |
| `{date}` | 发布时间 |
| `{post}` | 作品标题 |
| `{post_id}` | 作品 ID |
| `{time}` | 下载时间 |
| `{index0}` | 从 0 开始的序号，封面编号为 0 |
| `{index}` | 从 1 开始的序号，封面编号为空白 |
| `{auto_named}` | 文件名为 UUID 时使用序号命名，否则使用文件名 |
| `{name}` | 文件名（不含扩展名） |
| `{extension}` | 文件扩展名（不含 `.`） |
| `{js:...#}` | 自定义 JS 代码 |

**注意**: `{extension}` 不包含分隔符 `.`，需自行在命名中补上，例如 `{name}.{extension}`。

### Vim 模式

在设置中启用 Vim 模式后，可使用 `h`/`l` 键在帖子间导航。

## 支持的域名

- `kemono.party`
- `kemono.su`
- `kemono.cr`
- `nekohouse.su`

## 安装

[Greasy Fork 安装页](https://greasyfork.org/zh-CN/scripts/468718-kemono%E5%8A%A9%E6%89%8B)

## 致谢

感谢以下用户在反馈中提供的帮助和建议：

- **Op1345a** — 提供 safeFetch 重试逻辑和批量下载修复代码
- **SL Noein** — 验证和测试批量下载修复
- **cmcqj** — 发现 API 路径变更和反爬虫 headers 解决方案
- **PicLover** — 测试并确认 headers 修复有效
- **ChaseTheLight G (追光)** — 发现并修复正则贪婪匹配 bug，提交 PR
- **mitsukaze** — 发现 null name 崩溃问题并提供修复代码
- **nd002723** — 反馈 iframe 内链接被替换问题
- **jacklee0708** — 反馈封面图重复下载问题
- **Rui DSaaCC** — 反馈 .z01 扩展名解析和 .rar/.bin 问题
- **Tempale Nico** — 反馈收藏页下载逻辑错误
- **随便了啊** — 反馈 kemono.cr 域名变更和路径命名说明
- **Sallow Ringtine** — 反馈域名迁移需求
- **p7hoho** — 建议支持 nekohouse.su
- **kun199907** — 反馈域名变更后 API 路径问题
- **月k** — 反馈 Motrix 错误和按钮显示问题
- **Keys** — 反馈占位符信息无法显示
- **satia** — 反馈标题斜杠自动创建子文件夹
- **poixay** — 反馈 {date} 占位符多次使用问题
- **Utawa** — 反馈多版本帖子下载和 Linux 路径问题
- **洛青羽** — 反馈 Motrix 下载速度问题
- **kkrt1** — 反馈 PSD 文件不识别和文本保存需求
- **林昊飞**、**345fe35f4a3f4** — 反馈批量下载 403 错误
- **Slevin Wong**、**LONK**、**F6FBrickat**、**GFgatus**、**Wav vii** — 功能建议和支持

## 许可证

[GPL-3.0](LICENSE)

## GitHub

[https://github.com/ZIDOUZI/Kemono-Helper](https://github.com/ZIDOUZI/Kemono-Helper)
