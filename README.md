# MiConstructor - Spain Accredited Services Marketplace

Production-ready marketplace platform for Spain where clients post jobs/services and only platform-accredited professionals can contact and bid.

## Architecture

Monorepo with:
- **pnpm workspaces** + **Turbo** for build orchestration
- **PostgreSQL** + **Prisma** ORM
- **NestJS** backend API with JWT auth
- **Next.js 14** frontend (App Router)
- **Docker Compose** for local development

## Project Structure

```
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared types + Zod schemas
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

## Key Features

### Clients
- Post jobs with location + estimated cost
- Optional 5% platform guarantee (non-refundable)
- 100% escrow payment
- 7-day dispute window after completion
- Review pros after job completion

### Professionals
- Pass category tests for accreditation
- Progressive lead fees (4-8% based on job value)
- Pay-to-unlock client contact
- Internal GDPR-compliant messaging
- Build rating and reputation

### Admins
- Accredit/suspend professionals
- Resolve disputes
- Monitor negative review thresholds
- Manage category tests

## Business Rules

1. **Accreditation**: Only ACCREDITED pros can contact clients
2. **Guarantee**: Optional 5% fee (non-refundable)
3. **Lead Fees**: €0-500 (8%), €501-1000 (7%), €1001-1500 (6%), €1501-2000 (5%), >€2000 (4%)
4. **Escrow**: 100% held until completion + 7 days OR dispute resolution
5. **Auto-release**: After 7 days if no dispute
6. **Disputes**: Freeze escrow until admin resolves
7. **Reviews**: Only after escrow release; 5 negative (≤2★) trigger alert

## Getting Started

### Prerequisites
- Node.js >= 20
- pnpm >= 8
- Docker + Docker Compose

### Installation

```bash
pnpm install
pnpm docker:up

# In another terminal:
cd apps/api
pnpm prisma:migrate
pnpm seed

pnpm dev  # Start all services
```

### Access
- Web: http://localhost:3000
- API: http://localhost:3001
- DB: localhost:5432

### Demo Accounts
- Admin: admin@demo.es / Demo1234!
- Client: cliente@demo.es / Demo1234!
- Pro: pro@demo.es / Demo1234! (ACCREDITED)

## Development

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm lint       # Lint code
pnpm format     # Format code
pnpm typecheck  # Type check
```

## Tech Stack

**pnpm + Turbo**: Fast package manager + intelligent build caching
**NestJS**: Enterprise TypeScript framework with DI, guards, pipes
**Next.js 14**: Modern React with Server Components + App Router
**Prisma**: Type-safe ORM with excellent migrations
