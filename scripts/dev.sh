#!/bin/bash
pnpm dlx concurrently -n "API,WEB" \
             -c "yellow,blue" \
             "pnpm --filter=@monorepo-framework/api run dev" \
             "pnpm --filter=@monorepo-framework/web run dev" \