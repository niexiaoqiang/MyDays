# MyDaysBar

MyDays 的 macOS 状态栏采集器。读取本机的 Claude Code、Codex 会话和自己的 Git 提交，裁剪、脱敏后推送到 MyDays，替代 Docker 里的 `collector/collector.mjs`。

## 构建与安装

```bash
./scripts/build-app.sh            # 生成 build/MyDaysBar.app
./scripts/build-app.sh --install  # 复制到 /Applications 并启动
```

需要 macOS 15+ 和 Xcode（Swift 6）。目前用 ad-hoc 签名，只适合本机使用。

## 首次配置

1. 在 MyDays「设置 → 连接与令牌」创建一个“采集”令牌。
2. 点击状态栏图标 → 设置…，填入服务器地址和令牌，点“保存并同步”。
3. Git 目录和作者邮箱仍在 MyDays「设置 → Agent」里配置，应用每轮同步时读取。
4. 不再需要 Docker 采集器：`docker compose --profile agent-digest stop collector`。两边同时运行也不会重复记录（服务端按轮次 upsert），只是多做一份工作。

## 文件位置

- `~/Library/Application Support/MyDaysBar/settings.json`：服务器地址、令牌、同步间隔（权限 0600）。令牌暂不放钥匙串：ad-hoc 签名每次重新构建都会改变身份，钥匙串会反复请求授权。正式签名后再迁移。
- `~/Library/Application Support/MyDaysBar/collector/state.json`：已推送文件的大小和修改时间，没变化的文件不会再读。

## 命令行

`mydays-collect` 与应用共用同一套代码和设置，打包在 `MyDaysBar.app/Contents/Resources/` 下：

```bash
mydays-collect --once     # 同步一次（MYDAYS_URL / MYDAYS_TOKEN 可覆盖设置）
mydays-collect --dry-run  # 只统计，不联网
mydays-collect --dump     # 输出将要推送的轮次 JSON，用于和 Node 采集器逐字段比对
```

## 与 MyDays 的接口

全部使用 `Authorization: Bearer mdk_…`（采集令牌）：

| 接口 | 用途 |
|---|---|
| `GET /api/agent/config` | 是否开启、字数上限、时间窗口、Git 作者邮箱和目录 |
| `POST /api/agent/turns` | 每批最多 100 条轮次，返回 `accepted` |
| `POST /api/agent/collector-status` | 上报配置的 Git 目录能否找到、有几个仓库 |

解析、裁剪、脱敏规则与 `collector/collector.mjs` 保持一致；修改任意一边时，用 `--dump` 对比两边输出。
