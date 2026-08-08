#!/bin/bash
set -euo pipefail

pnpm dlx prettier --write --no-error-on-unmatched-pattern \
         "{apps,packages}/*/{src,tests}/**/*.{ts,tsx,js,jsx,mjs,cjs,css,json,svelte}" \
         "{apps,packages}/*/*.config.{ts,js,mjs,cjs}"
