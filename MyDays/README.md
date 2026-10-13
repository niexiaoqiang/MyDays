# MyDays

一个以“今天”为中心的轻量个人工作台，用来管理待办、记录工作时间线、暂存笔记和完成每日复盘。业务数据保存在服务端 SQLite 数据库中。

## 使用 Docker 启动（推荐）

需要预先安装 Docker Desktop。在项目目录执行：

```bash
docker compose up -d --build
```

然后访问 <http://localhost:4173>。

> `app.js`、`styles.css` 或页面文件修改后不会自动同步进已经运行的容器。开发时每次更新前端或服务端代码，都需要重新执行 `docker compose up -d --build`；只执行 `docker compose up -d` 会继续使用旧镜像。重建完成后刷新页面，必要时使用浏览器强制刷新。

页面栏目使用独立地址：

- 工作台：<http://localhost:4173/>
- 待办事项：<http://localhost:4173/tasks>
- 工作时间线：<http://localhost:4173/timeline>
- 今日复盘：<http://localhost:4173/review>
- 周期汇总：<http://localhost:4173/summary>
- AI 设置：<http://localhost:4173/ai-settings>

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

页面左下角的“导出数据备份”仍可导出可阅读的 JSON 文件，适合日常留档；Docker 卷备份则适合完整恢复 SQLite。

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
- 按日期查看和记录历史内容
- 临时笔记自动保存
- 根据当日记录自动整理复盘初稿
- 今日复盘统一汇总当天全部记录；周期汇总和底部周期复盘可按项目独立分类、保存和切换
- 按周、月、季度和年度自动汇总工作数据
- 周期汇总的“主要成果”可按当前周期和项目范围导出为 Markdown 或标准 Excel `.xlsx`，导出包含完整成果而不受页面分页影响
- 周期复盘按时间范围独立保存到 SQLite
- 按周期和项目用 AI 生成客观简洁的工作汇报（周报/月报式文字），可复制使用；「主要成果」列表保持原始记录，AI 不修改
- 配置多个 OpenAI 或 Claude 兼容 AI 服务并测试连接
- API Key 使用 AES-256-GCM 在服务端加密保存
- 以 JSON 格式导出完整数据备份
- SQLite 服务端持久化与 Docker 数据卷
- 增量保存：每次只提交发生变化的条目，多个标签页同时使用时互不覆盖对方修改的其他条目
- 桌面与移动端自适应布局
- 浅色 / 深色模式：默认跟随系统，也可在右上角 MY 菜单中手动切换（选择保存在当前浏览器）

## 数据说明

所有访问同一个 MyDays 部署地址的浏览器，共享该部署实例的一份 SQLite 数据库。当前版本按个人/家庭自托管场景设计，没有账号和权限隔离，请不要直接暴露到不可信的公网。

多个页面同时修改不同条目时会自动合并；同时修改同一条目（例如同一天的笔记）时，以后保存的一方为准。

AI 服务配置与业务数据分开保存，不会进入页面导出的 JSON 备份。默认情况下，MyDays 首次启动会在数据卷中创建权限为仅容器用户可读的 `/app/data/.ai-config-secret` 主密钥文件。也可以通过 `AI_CONFIG_SECRET` 环境变量显式指定稳定的主密钥；更换或丢失主密钥后，已有 API Key 需要重新填写。

周期主要成果的 Markdown / Excel 导出完全在浏览器本地生成，不会调用 AI、上传到第三方服务或修改 SQLite 数据。

公网 AI 服务的 Base URL 必须使用 HTTPS。本机、环回地址和私有局域网服务允许使用 HTTP。连接测试只会发送固定的最小测试提示，不会发送待办、笔记或复盘内容。

本地 Docker 默认从 `secrets/mydays_access_password.txt` 读取共享访问密码。修改文件内容后执行 `docker compose up -d` 使新密码生效；密码文件已被 `.gitignore` 排除，不会进入镜像。

本地 Compose 还启用了 `AI_ALLOW_PROXY_FAKE_IP=1`，用于兼容 Clash 等代理把 HTTPS 域名解析到 `198.18.0.0/15` Fake-IP 的情况。该兼容只接受 HTTPS 域名，直接填写 `198.18.x.x` 仍会被拒绝；公网 Compose 默认不开启此选项。

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

从旧版升级时，如果服务器数据库为空且当前浏览器中存在 `mydays.v1` 数据，页面会自动将旧记录迁移到 SQLite。迁移完成后不会删除浏览器中的旧数据，以便必要时人工核对。
