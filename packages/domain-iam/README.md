# IAM domain

This package owns IAM vocabulary, validation, errors, and pure policy helpers.
It deliberately owns no Prisma client or database connection; persistence stays
with the backend's existing Prisma schema and `PrismaService`.

The backend seed requires fresh authentication within five minutes for
weighting, threshold, publication, retirement, role-grant, and mapping changes.
Restricted exports use a ten-minute window. These defaults are persisted as
`StepUpPolicy` rows so deployments can manage policy without rebuilding clients.

Organizational scopes use the canonical `group`, `sector`, or `function` type
plus a separate identifier. The former UI example `org:global` is intentionally
not valid because `org` is not one of those persistence-backed scope types.
