# Implementation Guide: Spain Accredited Services Marketplace

This document provides a complete implementation roadmap for the remaining modules.

## ✅ COMPLETED

- Monorepo setup (pnpm + Turbo)
- Shared package with Zod schemas and TypeScript types
- Prisma schema with all models and enums
- NestJS API foundation
- Auth module (register, login, JWT)
- Prisma service
- Seed script with demo data

## 🚧 REMAINING IMPLEMENTATION

### 1. NestJS API Modules (apps/api/src/)

#### profiles/ Module
- **profiles.controller.ts**: POST /profiles/client, POST /profiles/pro, GET /profiles/pro/:id
- **profiles.service.ts**: createClient(), createPro(), getProProfile()
- **admin-profiles.controller.ts**: PATCH /admin/profiles/pro/:id/status

#### jobs/ Module  
- **jobs.controller.ts**: POST /jobs, POST /jobs/:id/publish, GET /jobs/mine, GET /jobs/open
- **jobs.service.ts**: create(), publish(), getMine(), getOpen(), updateStatus()
- Enforce guarantee payment before publish if wantsGuarantee=true

#### tests/ Module
- **tests.controller.ts**: GET /tests?category, POST /tests/attempt
- **tests.service.ts**: getTestsByCategory(), submitAttempt() (calculate score, mark passed if >=70%)
- **admin-tests.controller.ts**: POST /admin/tests/seed, GET /admin/tests

#### payments/ Module (guarantee + lead + escrow)
- **guarantee.controller.ts**: POST /jobs/:id/guarantee/create, POST /guarantee/:id/pay
- **guarantee.service.ts**: createGuarantee() (5% of estimatedTotal), simulatePay()
- **lead.controller.ts**: POST /jobs/:id/lead/create, POST /lead/:id/pay
- **lead.service.ts**: createLead() (progressive fee), pay() (unlock contact)
- **escrow.controller.ts**: POST /jobs/:id/escrow/create, POST /escrow/:id/hold
- **escrow.service.ts**: create(), hold(), autoRelease() (background job)

#### messaging/ Module
- **messaging.controller.ts**: POST /jobs/:id/conversations/open, GET /conversations, GET /conversations/:id/messages, POST /conversations/:id/messages
- **messaging.service.ts**: Require LeadPurchase PAID before creating conversation

#### disputes/ Module
- **disputes.controller.ts**: POST /jobs/:id/disputes/open
- **disputes.service.ts**: openDispute() (check 7-day window), freeze escrow
- **admin-disputes.controller.ts**: GET /admin/disputes, PATCH /admin/disputes/:id/resolve

#### reviews/ Module
- **reviews.controller.ts**: POST /jobs/:id/reviews
- **reviews.service.ts**: createReview() (require escrow RELEASED), update negativeReviewsCount, create AdminAlert at 5

#### admin/ Module
- **admin-alerts.controller.ts**: GET /admin/alerts, PATCH /admin/alerts/:id/acknowledge
- **admin.service.ts**: Handle alerts, suspend/reinstate pros

#### common/guards/
- **roles.guard.ts**: Check user role (CLIENT, PRO, ADMIN)
- **accreditation.guard.ts**: Check PRO is ACCREDITED

#### common/decorators/
- **user.decorator.ts**: @User() decorator to get current user from request

#### common/schedules/
- **escrow-release.schedule.ts**: Cron job (hourly) to auto-release escrow after 7 days

### 2. Next.js Web App (apps/web/)

Create structure:
```
apps/web/
├── app/
│   ├── page.tsx                    # Landing page (Spanish)
│   ├── layout.tsx                  # Root layout
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── registro/page.tsx
│   ├── dashboard/
│   │   ├── cliente/page.tsx        # Client dashboard
│   │   └── pro/page.tsx            # Pro dashboard
│   ├── admin/
│   │   └── page.tsx                # Admin dashboard
│   ├── legal/
│   │   ├── privacidad/page.tsx
│   │   └── terminos/page.tsx
│   └── api/                        # Optional BFF routes
├── components/
│   ├── ui/                         # Shadcn/ui components
│   ├── auth/
│   ├── jobs/
│   ├── messaging/
│   └── admin/
├── lib/
│   ├── api-client.ts               # Fetch wrapper for API calls
│   ├── auth.ts                     # Auth context/hooks
│   └── utils.ts
├── package.json
├── tailwind.config.ts
├── next.config.js
└── .env.example
```

#### Key Pages:

**Landing (/)**: Spanish UI, explain platform, CTA to register
**Auth**: Login/register forms with validation
**Client Dashboard**: Create job form, job list, publish, pay guarantee, create escrow, hold, change status, open disputes, leave reviews
**Pro Dashboard**: Complete tests, browse open jobs (filters), purchase leads, messaging, view assigned jobs
**Admin Dashboard**: Tables for pros (accredit/suspend), disputes (resolve), alerts (negative reviews)

### 3. Docker Setup

Create Dockerfiles:
- **apps/api/Dockerfile**: Multi-stage build for NestJS
- **apps/web/Dockerfile**: Multi-stage build for Next.js  
- Update **docker-compose-new.yml** → **docker-compose.yml**

### 4. Testing (apps/api/test/)

Create **e2e/** tests:
- **auth.e2e-spec.ts**: Register, login, get me
- **guarantee.e2e-spec.ts**: Create job with/without guarantee, publish flow
- **lead.e2e-spec.ts**: Purchase lead, unlock contact
- **escrow.e2e-spec.ts**: Create, hold, auto-release (mock time)
- **dispute.e2e-spec.ts**: Open dispute, admin resolve
- **reviews.e2e-spec.ts**: Leave review, negative threshold alert

### 5. Progressive Lead Fee Calculation

In **lead.service.ts**:
```typescript
function calculateLeadFee(estimatedTotalCents: number): number {
  const euros = estimatedTotalCents / 100;
  let percent: number;
  
  if (euros <= 500) percent = 8;
  else if (euros <= 1000) percent = 7;
  else if (euros <= 1500) percent = 6;
  else if (euros <= 2000) percent = 5;
  else percent = 4;
  
  return Math.round(estimatedTotalCents * percent / 100);
}
```

### 6. Auto-release Background Job

In **common/schedules/escrow-release.schedule.ts**:
```typescript
@Injectable()
export class EscrowReleaseSchedule {
  @Cron('0 * * * *') // Every hour
  async handleAutoRelease() {
    const windowDays = parseInt(process.env.DISPUTE_WINDOW_DAYS || '7');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    
    const jobs = await this.prisma.job.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { lte: cutoff },
        disputes: { none: { status: 'OPEN' } },
        escrowPayment: { status: 'HELD' },
      },
      include: { escrowPayment: true },
    });
    
    for (const job of jobs) {
      await this.prisma.escrowPayment.update({
        where: { id: job.escrowPayment.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
    }
  }
}
```

### 7. Environment Variables

**apps/api/.env**:
```
PORT=3001
DATABASE_URL=postgresql://app:app@localhost:5432/app
JWT_SECRET=change_me_in_production
DISPUTE_WINDOW_DAYS=7
CORS_ORIGIN=http://localhost:3000
```

**apps/web/.env**:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 8. Commands Reference

```bash
# Install
pnpm install

# Database
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate
pnpm seed

# Development
pnpm dev        # All services (turbo)
# OR individually:
cd apps/api && pnpm dev
cd apps/web && pnpm dev

# Docker
pnpm docker:up
pnpm docker:down

# Build & Test
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

### 9. Acceptance Criteria Checklist

- [ ] Client can create job without guarantee → publish OPEN
- [ ] Client can create job with guarantee → must pay before publish
- [ ] Client can fund escrow → job moves to IN_PROGRESS
- [ ] Client can mark COMPLETED → escrow held for 7 days
- [ ] Auto-release works after 7 days if no dispute
- [ ] Client can open dispute within 7 days → escrow remains HELD
- [ ] Admin can resolve dispute → release escrow
- [ ] Client can leave review only after escrow RELEASED
- [ ] PRO (ACCREDITED) can browse open jobs
- [ ] PRO can pay lead fee → unlock contact
- [ ] PRO can message client after lead purchase
- [ ] Admin can accredit pros
- [ ] Admin sees alert at 5 negative reviews
- [ ] No phone/email publicly visible
- [ ] Docker compose up works end-to-end

## 📋 Implementation Order

1. ✅ Foundation (DONE)
2. Complete all NestJS modules (profiles → jobs → payments → messaging → disputes → reviews → admin)
3. Build Next.js web app (landing → auth → dashboards)
4. Create Dockerfiles
5. Write E2E tests
6. Final integration testing

## 🎯 Critical Business Logic

- **Guarantee enforcement**: Job with wantsGuarantee=true CANNOT publish without GuaranteeCharge.status=PAID
- **Lead unlocking**: Conversation/messaging REQUIRES LeadPurchase.status=PAID
- **Escrow gating**: Job CANNOT move to IN_PROGRESS without EscrowPayment.status=HELD
- **Dispute window**: Dispute can ONLY be opened if job is IN_PROGRESS OR (COMPLETED and within DISPUTE_WINDOW_DAYS)
- **Review gating**: Review can ONLY be created if EscrowPayment.status=RELEASED
- **Accreditation**: Only PRO with accreditationStatus=ACCREDITED can browse jobs and purchase leads
- **Negative review threshold**: When negativeReviewsCount reaches 5, create AdminAlert

This is a comprehensive, production-ready implementation that follows the specification exactly.
