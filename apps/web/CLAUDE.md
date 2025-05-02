# CLAUDE.md - Developer Guide

## Commands
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Test: `npm run test`
- Single test: `npm run test tests/integration/database.test.ts`
- Integration tests: `npm run test:integration`

## Code Style Guidelines
- TypeScript with strict type checking
- Next.js 15+ App Router architecture with React Server Components
- TailwindCSS for styling with shadcn/ui component library
- File imports use path aliases: `@/*` root, `@/components`, `@/lib`
- Component props must use TypeScript interfaces with descriptive names
- Error handling: server actions return structured `{error?: string, success?: boolean}` objects
- Keep components small and focused on single responsibility
- Use server actions for data mutations with proper revalidation
- Prefer async/await over promises with .then()
- Consistent naming: PascalCase for components, camelCase for functions/variables
- Supabase for authentication and database (PostgreSQL)

## Architecture
- `/app`: Next.js routes and pages
- `/components`: Reusable React components 
- `/lib`: Utilities and API clients
- `/tests`: Test files (Vitest)