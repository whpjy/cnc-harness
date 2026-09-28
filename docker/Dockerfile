FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    DSH_HOME=/var/lib/deepseek-harness \
    NODE_ENV=production \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl git musl-tools python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.7.0 --activate \
    && python3 -m pip install --break-system-packages --no-cache-dir httpx==0.28.1 mcp==1.30.0

WORKDIR /opt/deepseek-harness
COPY deepseek-harness-cnc/ ./

RUN --mount=type=cache,id=deepseek-harness-pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile \
    && pnpm --dir native/system run build:native \
    && node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc -b tsconfig.host.json \
    && pnpm exec tsdown --env.DSH_BUILD_FACE host \
    && pnpm run build:lib:client \
    && pnpm run build:web \
    && mkdir -p /var/lib/deepseek-harness /workspace \
    && chown -R node:node /var/lib/deepseek-harness /workspace

# CNC MCP changes independently from the Harness application. Keep it after
# the expensive frontend/native build so backend policy edits reuse that layer.
COPY seksun-cnc/apps/api/app/ /opt/seksun-cnc-api/app/

USER node
WORKDIR /workspace

EXPOSE 3081

HEALTHCHECK --interval=20s --timeout=5s --start-period=60s --retries=5 \
  CMD curl --silent --show-error --output /dev/null http://127.0.0.1:3081/ || exit 1

CMD ["node", "/opt/deepseek-harness/scripts/cnc/docker-web.mjs"]
