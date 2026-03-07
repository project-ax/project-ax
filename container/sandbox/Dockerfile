# AX sandbox container — isolated tool execution
#
# Runs inside sandbox pods with gVisor/network isolation.
# Executes bash, file read/write/edit tool tasks dispatched via NATS.
#
# Entry point: node dist/sandbox-worker/main.js

FROM node:22-slim

# git is needed for workspace provisioning (git clone/push)
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r agent && useradd -r -g agent -m agent
RUN mkdir -p /workspace && chown agent:agent /workspace

WORKDIR /opt/ax
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

USER agent

ENTRYPOINT ["node"]
CMD ["dist/sandbox-worker/main.js"]
