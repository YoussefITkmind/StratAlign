# SPM Platform

A modern Strategic Performance Management (SPM) platform built using a TypeScript monorepo architecture.

The platform enables organizations to define strategic objectives, manage KPIs and OKRs, monitor performance, govern initiatives, manage portfolios, measure value realization, and generate enterprise dashboards and reports.

---

# Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend

- Node.js
- tRPC
- Prisma ORM
- PostgreSQL
- BullMQ

## Shared

- pnpm Workspaces
- Turborepo
- Zod
- Docker
- Pulumi

---

# Features

- Authentication (OIDC / Auth.js)
- Role-Based Access Control (IAM)
- Strategy Management
- KPI & OKR Management
- Performance Data Capture
- Balanced Scorecards
- Governance & Approval Workflows
- Initiative Management
- Portfolio Management
- Value Management
- Dashboards & Analytics
- Reporting
- Notifications
- Audit Logging
- Integrations

---

# Project Structure

```text
spm-platform/
│
├── apps/
│   ├── frontend/
│   └── backend/
│
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
│
├── tests/
│
├── infrastructure/
│
├── docs/
│
├── scripts/
│
├── .github/
│
├── package.json
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

# Folder Overview

| Folder         | Purpose                                         |
| -------------- | ----------------------------------------------- |
| apps           | Deployable applications                         |
| frontend       | Next.js web application                         |
| backend        | Node.js and tRPC backend API                    |
| packages       | Shared code between applications                |
| docs           | Project documentation                           |
| tests          | End-to-end, performance and accessibility tests |
| infrastructure | Docker and cloud infrastructure                 |
| scripts        | Development and database scripts                |
| .github        | GitHub Actions and templates                    |

---

# Getting Started

Clone the repository

```bash
git clone <repository-url>
cd spm-platform
```

Install dependencies

```bash
pnpm install
```

Start development

```bash
pnpm dev
```

---

# License

This project is for educational and development purposes.
