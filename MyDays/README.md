# MyDays

一个以“今天”为中心的轻量个人工作台，用来管理待办、记录工作时间线和完成每日复盘。业务数据保存在服务端 SQLite 数据库中。

## 使用 Docker 启动（推荐）

需要预先安装 Docker Desktop。在项目目录执行：

```bash
docker compose up -d --build
```

然后访问 <http://localhost:4173>。

> `app.js`、`styles.css` 或页面文件修改后不会自动同步进已经运行的容器。开发时每次更新前端或服务端代码，都需要重新执行 `docker compose up -d --build`；只执行 `docker compose up -d` 会继续使用旧镜像。重建完成后刷新页面，必要时使用浏览器强制刷新。

页面栏目使用独立地址：

- 工作台（待办、本周目标、工作时间线和今日复盘）：<http://localhost:4173/>
- 即将到期：<http://localhost:4173/upcoming>
- 周期汇总：<http://localhost:4173/summary>
- 设置：<http://localhost:4173/settings>

首次启动会自动创建 SQLite 数据库。数据库位于容器的 `/app/data/mydays.db`，并通过名为 `mydays_data` 的 Docker 卷持久化。执行 `docker compose down`、重启或重建容器都不会删除这个卷。

查看服务状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

默认使用 `4173` 端口。如需更换，例如改为 `8080`：

```bash
MYDAYS_PORT=8080 docker compose up -d --build
```

默认仅绑定 `127.0.0.1`，不会直接暴露到局域网或公网。

请不要使用 `docker compose down -v`，其中的 `-v` 会删除保存 SQLite 数据的卷。

## 数据备份

为保证 SQLite 主文件和 WAL 日志的一致性，备份前先短暂停止服务：

```bash
docker compose stop
docker run --rm \
  -v mydays_data:/data:ro \
  -v "$PWD":/backup \
  alpine:3.22 \
  tar czf /backup/mydays-data.tar.gz -C /data .
docker compose start
```

这会在当前目录生成 `mydays-data.tar.gz`。恢复备份会覆盖现有数据库，请先确认数据卷名称和备份文件，再手动执行恢复操作。

「设置 → 数据」中的“导出备份”可导出可阅读的 JSON 文件，“导入备份”可用它整体替换当前的待办、记录、复盘和周期汇报（导入前会自动下载一份当前数据；旧版本导出的备份也能导入，其中的临时笔记会并入当天复盘）。JSON 备份不包含 AI 服务配置、项目选项和 Agent 工作汇总的设置与素材；需要完整恢复时请使用上面的 Docker 卷备份。

## 不使用 Docker

项目没有第三方依赖，但 SQLite 版本需要 Node.js 24 或更高版本运行后端，不能再直接打开 `index.html`：

```bash
PORT=4173 npm start
```

然后访问 <http://localhost:4173>。

这种方式会将数据库写入项目下的 `data/mydays.db`。

## 第一版功能

- 快速添加待办事项或工作记录
- 待办事项和工作记录支持 AI 润色预览，确认采用后仍由用户手动添加
- 按普通、重要、稍后设置待办优先级
- 待办完成后自动写入工作时间线
- 截止日期与提醒：显示今天截止、还剩几天、逾期几天；页面开着时到点弹出浏览器通知
- 未完成待办自动顺延到今天并标出顺延天数（可在待办列表右上角的“待办设置”中关闭）
- 重复待办：每天、工作日、每周、每月，当天自动生成，可在“待办设置”中暂停或删除
- 按日期查看和记录历史内容；侧边栏的月历热力图显示每天的记录量，点一下就跳到那天
- 侧边栏列出项目和各自的未完成待办数，点项目直接看它的周期汇总
- 规划今天：打开今天时列出还没排进今天、或 3 天内到期的待办，一键加入
- 今日重点：给最多 3 件待办点星标，排在最前面，完成度圆环改为统计重点
- 本周目标：每周最多 5 个，待办可以关联目标并显示进度；周期汇总和 AI 周报会对照目标写进展
- 即将到期：按日期列出已逾期、今天到期和之后两周的待办，可一键移到今天
- 快速记录：用“快速记录”令牌从 iOS 快捷指令、Raycast 或脚本直接添加待办和工作记录（见「设置 → 连接与令牌」），页面开着时会自动同步进来
- 今日复盘是一段自由文字，记下问题、想法和值得留意的事（当天做了什么在时间线里，明天要做的直接加成待办）
- 按周、月、季度、年度或自定义时间段（最长一年，如上半年、去年）汇总工作数据，开启 Agent 工作汇总后显示按代码目录估算的 AI 协作时间
- 周期汇总的“主要成果”可按当前时间范围和项目导出为 Markdown 或标准 Excel `.xlsx`，导出包含完整成果而不受页面分页影响
- 按时间范围和项目用 AI 生成工作汇报：固定周期写成周报/月报式文字，自定义时间段写成按主题分组的成果总结；结果可编辑、复制或下载为 Markdown，并和“补充说明”一起保存到 SQLite；「主要成果」列表保持原始记录，AI 不修改
- 配置多个 OpenAI 或 Claude 兼容 AI 服务并测试连接
- API Key 使用 AES-256-GCM 在服务端加密保存
- 搜索全部待办、工作记录、复盘和周期汇报（顶栏搜索按钮或 ⌘K / Ctrl+K）
- 以 JSON 格式导出完整数据备份，并可从备份文件导入恢复
- Agent 工作汇总（可选，默认关闭）：每天自动把 Claude Code、Codex 中完成的工作和本人的 Git 提交整理成几条主要工作写入时间线
- 只读 MCP 服务：让 Claude Code、Codex 等 agent 查询你的 MyDays 记录
- SQLite 服务端持久化与 Docker 数据卷
- 增量保存：每次只提交发生变化的条目，多个标签页同时使用时互不覆盖对方修改的其他条目
- 桌面与移动端自适应布局
- 浅色 / 深色模式：默认跟随系统，也可在右上角 MY 菜单中手动切换（选择保存在当前浏览器）

## 数据说明

所有访问同一个 MyDays 部署地址的浏览器，共享该部署实例的一份 SQLite 数据库。当前版本按个人/家庭自托管场景设计，没有账号和权限隔离，请不要直接暴露到不可信的公网。

多个页面同时修改不同条目时会自动合并；同时修改同一条目（例如同一天的复盘）时，以后保存的一方为准。

AI 服务配置与业务数据分开保存，不会进入页面导出的 JSON 备份。默认情况下，MyDays 首次启动会在数据卷中创建权限为仅容器用户可读的 `/app/data/.ai-config-secret` 主密钥文件。也可以通过 `AI_CONFIG_SECRET` 环境变量显式指定稳定的主密钥；更换或丢失主密钥后，已有 API Key 需要重新填写。

周期主要成果的 Markdown / Excel 导出完全在浏览器本地生成，不会调用 AI、上传到第三方服务或修改 SQLite 数据。

公网 AI 服务的 Base URL 必须使用 HTTPS。本机、环回地址和私有局域网服务允许使用 HTTP。连接测试只会发送固定的最小测试提示，不会发送待办或复盘内容。

本地 Docker 默认从 `secrets/mydays_access_password.txt` 读取共享访问密码。修改文件内容后执行 `docker compose up -d` 使新密码生效；密码文件已被 `.gitignore` 排除，不会进入镜像。

本地 Compose 还启用了 `AI_ALLOW_PROXY_FAKE_IP=1`，用于兼容 Clash 等代理把 HTTPS 域名解析到 `198.18.0.0/15` Fake-IP 的情况。该兼容只接受 HTTPS 域名，直接填写 `198.18.x.x` 仍会被拒绝；公网 Compose 默认不开启此选项。

## Agent 工作汇总（可选）

这个功能把你在 AI agent 中完成的工作，每天自动整理成几条「主要工作」写入时间线。它由两部分组成：

- **采集器**：运行在有 agent 的电脑上（Mac 上推荐状态栏应用 MyDaysBar，其他电脑用随附的 Node 版 `collector/collector.mjs`），读取本机会话文件，只提取你的提问和 agent 每轮的最终答复（不含工具调用和工具输出），隐藏常见形态的密钥后推送给 MyDays。目前支持 Claude Code 和 Codex。
- **MyDays 服务端**：暂存这些摘录，每天到设定时间（默认 18:30）用你配置的 AI 服务按当天实际的工作主题整理成若干条记录（工作少时一两条，多时最多 12 条），带「AI 整理」标记写入当天时间线。当晚的工作会在第二天定稿时补上；服务没运行的日期，启动后自动补跑最近 7 天。

### 开启步骤

1. 在右上角 MY → 设置 → AI 服务中，先配置一个带 API Key 的 AI 服务。
2. 在同一页面的「Agent 工作汇总」里打开开关，确认时区和整理时间。
3. 在「设置 → 连接与令牌」创建一个用途为“采集”的令牌，然后选择一种采集器：

   - **Mac：MyDaysBar（推荐）**。状态栏应用，源码在本仓库的 `mydays-mac` 目录，用其中的 `./scripts/build-app.sh --install` 构建并安装到 `/Applications`。点击状态栏图标 → 设置…，填入 MyDays 地址和令牌后保存。它直接读取本机的 `~/.claude/projects`、`~/.codex/sessions` 和 Git 仓库。
   - **其他电脑或 Linux：Node 版采集器**（需要 Node.js 24）。在那台电脑上取得本项目代码后运行：

     ```bash
     MYDAYS_URL=https://mydays.example.com MYDAYS_TOKEN=mdk_xxx node collector/collector.mjs
     ```

     会话目录不在默认位置时，用 `CLAUDE_PROJECTS_DIR`、`CODEX_SESSIONS_DIR` 指定。

4. 想把本人的 Git 提交也纳入整理，在「设置 → Agent 汇总」填写“仓库目录”（运行采集器那台电脑上的路径，每行一个，向下查找三层）和 Git 作者邮箱，采集器下一轮生效，设置页会显示每个目录找到了几个仓库。采集器只读取这些邮箱提交的提交说明和改动规模，不读取代码内容；提交不计入 AI 协作时间。

接入前可以先看采集规模，这个命令（MyDaysBar 对应 `mydays-collect --dry-run`）只打印各 agent 的文件数、轮次数和字数，不发送任何内容：

```bash
node collector/collector.mjs --dry-run
```

### 让 agent 读取 MyDays

MyDays 提供一个只读的 MCP 服务，Claude Code、Codex 等 agent 接入后可以直接查询你的记录，例如“我上周做了什么”“帮我写本月周报”“上次 WebSocket 断线是怎么处理的”。它提供三个工具：搜索记录、读取某天或某段日期的记录（最多 31 天）、读取某个周 / 月 / 季 / 年的概览（指标、成果、未完成事项、AI 协作时间、已保存的周报）。

1. 在「设置 → 连接与令牌」中创建一个用途为“读取”的令牌。
2. 在 Claude Code 中注册（需要本机安装 Node.js 24）：

   ```bash
   claude mcp add mydays -e MYDAYS_URL=http://localhost:4173 -e MYDAYS_TOKEN=mdk_xxx -- node /path/to/MyDays/collector/mcp.mjs
   ```

3. Codex 在 `~/.codex/config.toml` 中添加：

   ```toml
   [mcp_servers.mydays]
   command = "node"
   args = ["/path/to/MyDays/collector/mcp.mjs"]
   env = { MYDAYS_URL = "http://localhost:4173", MYDAYS_TOKEN = "mdk_xxx" }
   ```

读取令牌能看到全部待办、记录、复盘和周期汇报，但不能修改任何数据，也不能推送素材；采集令牌则只能推送素材、不能读取。这个 MCP 服务独立于“Agent 工作汇总”开关，不开启汇总也能使用。

### 需要知道的

- 关闭开关后，服务端拒收素材、不再调用 AI，采集器也不再读取任何会话文件。
- 会话摘录在 MyDays 中暂存 30 天，可在设置页一键清除；它们不进入页面的 JSON 导出备份，但包含在 Docker 数据卷备份里。
- 摘录会发送给你选择的 AI 服务。密钥隐藏基于规则匹配，无法保证覆盖所有敏感内容；可以按目录名排除不想汇总的项目。
- 汇总条目和普通记录一样可以编辑、删除。编辑过的条目归你所有，之后的重新整理不会覆盖它。
- 模型开销与当天的对话量成正比，可以在设置页限制每日输入字数，并为这个功能单独选择一个更便宜的 AI 服务。
- MyDaysBar 需要 macOS 15+；Node 版采集器以运行它的用户身份读取会话文件，需要对这些目录有读权限。
- 功能按单用户设计：多人共用一个 MyDays 时，汇总会进入同一条时间线。

## 公网受邀测试部署

公网模式使用一个共享访问密码，只适合少量受邀测试者；所有测试者会看到同一份数据，不具备账号或租户隔离。

先创建不会加入 Git 的秘密文件：

```bash
mkdir -p secrets
openssl rand -base64 36 > secrets/mydays_access_password.txt
openssl rand -base64 48 > secrets/mydays_ai_secret.txt
chmod 600 secrets/*.txt
```

将域名解析到服务器，防火墙只开放 TCP 80/443（需要 HTTP/3 时再开放 UDP 443），然后启动：

```bash
MYDAYS_DOMAIN=mydays.example.com docker compose -f compose.public.yaml up -d --build
```

公网 Compose 只有 Caddy 发布主机端口，MyDays 应用容器不直接发布端口。Caddy 会自动申请 HTTPS 证书。访问密码和 AI 主密钥通过 Docker secrets 提供，不要把秘密写入 Compose、镜像、页面或命令历史。

SQLite 数据卷备份与 `mydays_ai_secret.txt` 必须分开且同等安全地保管。丢失 AI 主密钥后，已有 API Key 无法恢复。会话只保存在应用内存中，容器重启后会全部失效。
