# Contractor Monorepo Restructure Guide

**Goal:** Merge the current Next.js UI and LangGraph service into one fast-iteration workspace while letting BAML autogenerate *two* clients:

- `apps/web/baml_client/` (TypeScript/React)
- `apps/langgraph/baml_client_py/` (Python/Pydantic)

---

## 1. Final Directory Layout

```
contractor-monorepo/
├─ apps/
│  ├─ web/                # ← from contractor-app
│  │  ├─ app/ …
│  │  ├─ public/
│  │  ├─ baml_client/     # generated TS client (DO NOT EDIT)
│  │  ├─ next.config.js
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ langgraph/          # ← from file-processor
│     ├─ src/file_processor/ …
│     ├─ baml_client_py/  # generated Python client (DO NOT EDIT)
│     ├─ langgraph.json
│     ├─ pyproject.toml
│     └─ README.md
├─ baml_src/              # .baml schemas live here
│  └─ *.baml
├─ .github/workflows/ci.yml
├─ pnpm-workspace.yaml
├─ package.json           # root dev scripts + devDeps
├─ tsconfig.base.json
├─ eslint.config.mjs
├─ tailwind.config.ts
├─ postcss.config.mjs
├─ vitest.config.ts
└─ README.md
```

---

## 2. Prerequisites

| Tool         | Version     |
|--------------|-------------|
| **Node**     | ≥ 20        |
| **pnpm**     | ≥ 9         |
| **Python**   | 3.10 – 3.11 |
| **Poetry**   | ≥ 1.8       |
| **BAML CLI** | 0.86.1 (via `pnpm add -D @boundaryml/baml`) |
| **Git**      | modern      | Version     |
|--------------|-------------|
| **Node**     | ≥ 20        |
| **pnpm**     | ≥ 9         |
| **Python**   | 3.10 – 3.11 |
| **Poetry**   | ≥ 1.8       |
| **BAML CLI** | 0.86.1      |
| **Git**      | modern      |

---

## 3. Step-by-Step Instructions

### 3.1 Create the new repo

```bash
mkdir ~/Documents/contractor-monorepo
cd ~/Documents/contractor-monorepo
git init -b main
pnpm init -y
```

Add `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "baml_src"
```

### 3.2 Move the old projects

```bash
mv /Users/otto/Documents/contractor/contractor-app apps/web
mv /Users/otto/Documents/contractor/file-processor apps/langgraph
```

Delete `node_modules`, `package-lock.json`, and `tsconfig.tsbuildinfo` from `apps/web`.

### 3.3 Root-level configs (copy or create)

- `eslint.config.mjs`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `tsconfig.base.json`
- `vitest.config.ts`
- `.github/workflows/ci.yml` (see §5)

### 3.4 Configure BAML generators

In `baml_src/generators.baml`:

```baml
generator ts_client {
  output_type        "typescript/react"
  output_dir         "../apps/web/baml_client"
  version            "0.86.1"
  default_client_mode async
}

generator py_client {
  output_type        "python/pydantic"
  output_dir         "../apps/langgraph/baml_client_py"
  version            "0.86.1"
  default_client_mode sync
}
```

### 3.5 Generate the clients

You can run BAML CLI via `pnpm` (preferred for monorepos with Node-based tooling):

```bash
pnpm exec baml_cli generate --baml_dir baml_src
```

Alternatively, for Python-only environments, you can install it via Poetry:

```bash
poetry add --group dev baml-cli
poetry run baml_cli generate --baml_dir baml_src
```

# from repo root
baml_cli generate --baml_dir baml_src
```

Add a watch script to root `package.json`:

```jsonc
{
  "scripts": {
    "dev:baml": "baml_cli generate --watch --baml_dir baml_src"
  }
}
```

### 3.6 Update `apps/web`

**`apps/web/package.json`**:

```jsonc
{
  "name": "@contractor/web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

**`apps/web/tsconfig.json`**:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
}
```

### 3.7 Update `apps/langgraph`

In `pyproject.toml`, add the generated package:

```toml
[tool.poetry]
packages = [
  { include = "file_processor" },
  { include = "baml_client_py", from = "." }
]
```

### 3.8 Git ignore & housekeeping

```bash
node_modules
apps/*/baml_client
apps/*/baml_client_py
dist
.env*
apps/langgraph/.venv
```

---

## 4. Root Dev Scripts

Root `package.json`:

```jsonc
{
  "scripts": {
    "dev": "pnpm --parallel --filter ./apps/* dev",
    "dev:baml": "baml_cli generate --watch --baml_dir baml_src",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "@boundaryml/baml": "0.86.1",
    "eslint": "^9",
    "vitest": "^1.5"
  },
  "packageManager": "pnpm@9"
}
```

---

## 5. CI (`.github/workflows/ci.yml`)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run dev:baml      # regenerate clients
      - run: pnpm run lint && pnpm test
      - run: pnpm --filter @contractor/web build
      - uses: langchain-ai/langgraph-action@v1   # deploy python app
```

---

## 6. Smoke-Test Checklist

| Task             | Command                                         |
|------------------|--------------------------------------------------|
| Install & watch  | `pnpm i && pnpm run dev:baml`                   |
| UI boots         | `pnpm --filter @contractor/web dev → http://localhost:3000` |
| Python tests     | `cd apps/langgraph && poetry run pytest`       |
| CI passes        | Push a PR, check Actions tab                   |




## 7. Other random notes
- Combine all vs code settings, cursor rules, etc
- Combine .env files - or create ones in subdirectories as needed with the right contents. 