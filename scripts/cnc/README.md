# Local CNC Harness runtime

These Windows scripts pin the durable configuration root to the current user's `~/.dsh` and apply `qwen-cnc.patch.yml` on every launch. The model catalog therefore does not depend on a transient shell environment or working directory. API keys remain only in the Harness credential store and never enter the repository.

```powershell
pnpm run cnc:web:start
pnpm run cnc:web:status
pnpm run cnc:web:stop
pnpm run cnc:web:autostart
```

The launcher validates Node, dependencies, the Web profile, and the `DASHSCOPE_API_KEY` credential reference. It backs up the current Web profile and credential store before starting a background supervisor. The supervisor restarts the service after an exit or five consecutive failed health checks. Runtime state and logs live in `.dsh/run`; configuration backups live in `~/.dsh/backups/cnc-web`.

The CNC MCP starts through `run-cnc-mcp.ps1`, which selects a Python interpreter that can import both `mcp` and `app.cnc_mcp`. Set `CNC_MCP_PYTHON` to choose one explicitly. A stale system `python` command can no longer silently remove the CNC tool connection.

`cnc:web:autostart` registers a per-user Windows scheduled task that starts at sign-in and performs an idempotent check every five minutes. A healthy supervised service is not restarted. Run `pnpm run cnc:web:autostart:remove` to remove the task.

A normal start does not take over an occupied port 3081. When the existing listener is known to be an older Harness process, replace it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cnc/start-web.ps1 -Replace
```

## Docker deployment

`seksun-cnc/compose.yaml` deploys the CNC API, simulation dependencies, Web application, and Harness together. The Harness image pins Node, the Python MCP dependencies, and the Qwen model overlay. `harness_data` persists settings, credentials, sessions, and attachments; `harness_workspace` persists the working directory. Rebuilding the image does not remove either volume.

```powershell
cd ..\seksun-cnc
docker compose build harness
docker compose up -d
docker compose ps
```

Harness is served at `http://127.0.0.1:3081/`. After the first start, read the local authenticated URL containing `token` from `docker compose logs harness`. `DASHSCOPE_API_KEY` is injected from `seksun-cnc/.env` and is never copied into the image.
