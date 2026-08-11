# StratAlign Infrastructure — DEV

This Pulumi project owns the development data/storage tier established by
Prompt 0.9.

## DEV architecture

Pulumi manages:

- PostgreSQL 17
- Redis 7
- MinIO S3-compatible object storage
- `raw` bucket
- `conformed` bucket
- `artifacts` bucket
- `journal-worm` bucket

The `journal-worm` bucket is created with object locking enabled and a default
30-day COMPLIANCE retention policy.

## Why Docker for DEV

The repository already uses Docker for local PostgreSQL, Redis, and the mock
OIDC provider. The Prompt 0.9 DEV implementation therefore uses Pulumi's
Docker provider so the same infrastructure definition can run in Codespaces
and on team development machines without requiring personal cloud accounts.

The production cloud/runtime topology is not provisioned here. The later
infrastructure phase expands the Pulumi component library for
SIT/UAT/PROD/DR.

## Ports

The Pulumi-managed DEV stack intentionally uses alternate host ports so it can
coexist with the existing Docker Compose development environment:

| Service | Host port |
|---|---:|
| PostgreSQL | 15432 |
| Redis | 16379 |
| MinIO API | 19000 |
| MinIO Console | 19001 |

Ports are configurable through Pulumi configuration.

## DEV configuration

`Pulumi.dev.yaml` pins the DEV ports and container image tags. Credentials
have no defaults in source control and must be stored as encrypted Pulumi
stack configuration before previewing or deploying:

```sh
pulumi config set --secret postgresPassword
pulumi config set --secret minioRootUser
pulumi config set --secret minioRootPassword
```

The MinIO server and client use publisher release tags rather than mutable
`latest` tags. PostgreSQL and Redis retain the repository-wide image tags
already exercised by Docker Compose, CI, and Testcontainers.

## Storage contract

Later application modules should treat object-storage references as opaque and
use these logical buckets:

- `raw`
- `conformed`
- `artifacts`
- `journal-worm`

The physical storage provider must not leak into domain code.
