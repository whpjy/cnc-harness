# CNC Harness 本地运行

这组 Windows 脚本固定使用当前用户的 `~/.dsh` 作为持久配置目录，并在每次启动时应用 `qwen-cnc.patch.yml`。模型目录因此不依赖临时环境变量或启动目录；API 密钥仍只保存在 Harness 的凭据库中，不进入仓库。

```powershell
pnpm run cnc:web:start
pnpm run cnc:web:status
pnpm run cnc:web:stop
pnpm run cnc:web:autostart
```

启动器会校验 Node、依赖、Web profile 与 `DASHSCOPE_API_KEY` 凭据引用，备份当前 Web profile 和凭据库，再启动后台守护进程。守护进程在服务退出或连续五次健康检查失败后重启服务。运行状态和日志位于仓库的 `.dsh/run`，配置备份位于 `~/.dsh/backups/cnc-web`。

CNC MCP 通过 `run-cnc-mcp.ps1` 探测能够同时导入 `mcp` 与 `app.cnc_mcp` 的 Python。可以用 `CNC_MCP_PYTHON` 显式指定解释器；无效的系统 `python` 命令不会再导致工具连接丢失。

`cnc:web:autostart` 注册当前用户的 Windows 计划任务，在登录时启动，并每五分钟进行一次幂等检查。健康且受守护的服务不会被重启。使用 `pnpm run cnc:web:autostart:remove` 可以移除该任务。

正常启动不会接管已占用的 3081 端口。确认端口上的旧 Harness 进程可以替换时，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cnc/start-web.ps1 -Replace
```

## Docker 部署

生产式本地部署由 `seksun-cnc/compose.yaml` 统一编排 CNC API、仿真依赖、Web 和 Harness。Harness 镜像固定 Node、Python MCP 依赖和 Qwen 模型覆盖层；`harness_data` 保存配置、凭据、会话和附件，`harness_workspace` 保存工作区。重新构建镜像不会删除这些卷。

```powershell
cd ..\seksun-cnc
docker compose build harness
docker compose up -d
docker compose ps
```

Harness 地址为 `http://127.0.0.1:3081/`。首次启动后，从 `docker compose logs harness` 中读取带 `token` 的本地认证地址。`DASHSCOPE_API_KEY` 从 `seksun-cnc/.env` 注入，不写入镜像。
