"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";
import { StepUpModal } from "@/components/admin/step-up-modal";
import { PLATFORM_ROLES, type PlatformRole } from "@spm/domain-iam";

type Role = PlatformRole;

type TRPCErrorLike = { message?: string; data?: { stepUpRequired?: boolean } | null };
const pendingOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("createMapping"), input: z.object({
    groupName: z.string(), role: z.enum(PLATFORM_ROLES), orgScope: z.string(),
  }) }),
  z.object({ kind: z.literal("updateMapping"), input: z.object({
    id: z.string(), role: z.enum(PLATFORM_ROLES), orgScope: z.string(),
  }) }),
  z.object({ kind: z.literal("grantScope"), input: z.object({
    userId: z.string(), role: z.enum(PLATFORM_ROLES), orgScope: z.string(),
  }) }),
]);
type PendingOperation = z.infer<typeof pendingOperationSchema>;
const OIDC_PENDING_OPERATION_KEY = "stratalign.oidc-step-up-operation";

export function AdminClient({
  authenticationMethod,
}: {
  authenticationMethod: "credentials" | "oidc";
}) {
  const { t } = useI18n();
  const utils = trpc.useUtils();

  const mappingsQuery = trpc.iam.listGroupRoleMappings.useQuery();
  const usersQuery = trpc.iam.listCredentialUsers.useQuery();
  const grantsQuery = trpc.iam.listUserRoleGrants.useQuery();

  const [tab, setTab] = useState<"mappings" | "grant">("mappings");
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [mappingRole, setMappingRole] = useState<Role | "">("");
  const [mappingScope, setMappingScope] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<Role | "">("");
  const [grantScope, setGrantScope] = useState("");

  function handleError(err: TRPCErrorLike, retry: () => void, operation: PendingOperation) {
    if (err?.data?.stepUpRequired) {
      setPendingRetry(() => retry);
      setPendingOperation(operation);
      setStepUpOpen(true);
      return;
    }
    setError(err?.message ?? "Something went wrong.");
  }

  const createMapping = trpc.iam.createGroupRoleMapping.useMutation({
    onSuccess: () => {
      utils.iam.listGroupRoleMappings.invalidate();
      setGroupName("");
      setMappingRole("");
      setMappingScope("");
      setError(null);
    },
    onError: (err) =>
      mappingRole && handleError(
        err,
        () => createMapping.mutate({ groupName, role: mappingRole, orgScope: mappingScope }),
        { kind: "createMapping", input: { groupName, role: mappingRole, orgScope: mappingScope } },
      ),
  });

  const updateMapping = trpc.iam.updateGroupRoleMapping.useMutation({
    onSuccess: () => {
      utils.iam.listGroupRoleMappings.invalidate();
      setEditingId(null);
      setError(null);
    },
    onError: (err) => {
      const id = editingId;
      if (!id) return;
      if (mappingRole) handleError(
        err,
        () => updateMapping.mutate({ id, role: mappingRole, orgScope: mappingScope }),
        { kind: "updateMapping", input: { id, role: mappingRole, orgScope: mappingScope } },
      );
    },
  });

  const grantMutation = trpc.iam.grantUserRoleScope.useMutation({
    onSuccess: () => {
      utils.iam.listUserRoleGrants.invalidate();
      utils.iam.listCredentialUsers.invalidate();
      setGrantUserId("");
      setGrantRole("");
      setGrantScope("");
      setError(null);
    },
    onError: (err) =>
      grantRole && handleError(
        err,
        () => grantMutation.mutate({ userId: grantUserId, role: grantRole, orgScope: grantScope }),
        { kind: "grantScope", input: { userId: grantUserId, role: grantRole, orgScope: grantScope } },
      ),
  });

  const resumedOidcStepUp = useRef(false);
  useEffect(() => {
    if (resumedOidcStepUp.current || new URLSearchParams(window.location.search).get("stepUp") !== "complete") {
      return;
    }
    resumedOidcStepUp.current = true;
    const encoded = window.sessionStorage.getItem(OIDC_PENDING_OPERATION_KEY);
    window.sessionStorage.removeItem(OIDC_PENDING_OPERATION_KEY);
    window.history.replaceState({}, "", window.location.pathname);
    if (!encoded) return;
    try {
      const operation = pendingOperationSchema.safeParse(JSON.parse(encoded));
      if (!operation.success) return;
      if (operation.data.kind === "createMapping") createMapping.mutate(operation.data.input);
      else if (operation.data.kind === "updateMapping") updateMapping.mutate(operation.data.input);
      else grantMutation.mutate(operation.data.input);
    } catch {
      // Invalid browser state is ignored; backend validation remains authoritative.
    }
  }, [createMapping, grantMutation, updateMapping]);

  function startEdit(mapping: { id: string; role: Role; orgScope: string; groupName: string }) {
    setEditingId(mapping.id);
    setGroupName(mapping.groupName);
    setMappingRole(mapping.role);
    setMappingScope(mapping.orgScope);
  }

  function submitMappingForm(e: React.FormEvent) {
    e.preventDefault();
    if (!mappingRole) return;
    if (editingId) {
      updateMapping.mutate({ id: editingId, role: mappingRole, orgScope: mappingScope });
    } else {
      createMapping.mutate({ groupName, role: mappingRole, orgScope: mappingScope });
    }
  }

  function submitGrantForm(e: React.FormEvent) {
    e.preventDefault();
    if (!grantUserId || !grantRole || !grantScope) return;
    grantMutation.mutate({ userId: grantUserId, role: grantRole, orgScope: grantScope });
  }

  const tabButtonClass = (isActive: boolean) =>
    "rounded-full px-4 py-2 text-[13px] font-medium transition " +
    (isActive ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700");

  const roleLabel = (role: Role) => t(`common.role_${role}`);

  return (
    <div>
      <StepUpModal
        open={stepUpOpen}
        authenticationMethod={authenticationMethod}
        onOidcStart={() => {
          if (pendingOperation) {
            window.sessionStorage.setItem(
              OIDC_PENDING_OPERATION_KEY,
              JSON.stringify(pendingOperation),
            );
          }
        }}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          pendingRetry?.();
          setPendingRetry(null);
        }}
      />

      <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">{t("admin.title")}</h1>
      <p className="mt-1 text-[14px] text-slate-500">{t("admin.subtitle")}</p>

      <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-slate-100 p-1">
        <button
          data-testid="tab-mappings"
          className={tabButtonClass(tab === "mappings")}
          onClick={() => setTab("mappings")}
        >
          {t("admin.tabMappings")}
        </button>
        <button
          data-testid="tab-grant"
          className={tabButtonClass(tab === "grant")}
          onClick={() => setTab("grant")}
        >
          {t("admin.tabGrant")}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {tab === "mappings" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-start text-[13px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t("admin.mappingGroup")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("admin.mappingRole")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("admin.mappingScope")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("admin.mappingUpdated")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {mappingsQuery.data?.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{m.groupName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{roleLabel(m.role)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.orgScope}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {new Date(m.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <button
                        onClick={() => startEdit(m)}
                        className="text-[12.5px] font-medium text-[var(--brand-accent,#2E8FA3)] hover:underline"
                      >
                        {t("common.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
                {mappingsQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={submitMappingForm}
            className="h-fit rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 className="text-[14px] font-semibold text-slate-900">
              {editingId ? t("admin.editMapping") : t("admin.newMapping")}
            </h2>
            <div className="mt-4 flex flex-col gap-3.5">
              <div>
                <label htmlFor="mapping-group-name" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.groupNameLabel")}
                </label>
                {/* `org:global` is not canonical; the translated example uses type:id. */}
                <input
                  id="mapping-group-name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={Boolean(editingId)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label htmlFor="mapping-role" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.roleLabel")}
                </label>
                <select
                  id="mapping-role"
                  value={mappingRole}
                  onChange={(e) => setMappingRole(e.target.value as Role)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
                >
                  <option value="">—</option>
                  {PLATFORM_ROLES.map((role) => (
                    <option key={role} value={role}>{roleLabel(role)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mapping-org-scope" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.orgScopeLabel")}
                </label>
                <input
                  id="mapping-org-scope"
                  value={mappingScope}
                  onChange={(e) => setMappingScope(e.target.value)}
                  placeholder={t("admin.scopePlaceholder")}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
                />
              </div>
              <div className="flex gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setGroupName("");
                      setMappingRole("");
                      setMappingScope("");
                    }}
                    className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100"
                  >
                    {t("common.cancel")}
                  </button>
                )}
                <button
                  type="submit"
                  data-testid="save-mapping"
                  disabled={createMapping.isPending || updateMapping.isPending}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
                >
                  {t("admin.saveMapping")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {tab === "grant" && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr]">
          <form onSubmit={submitGrantForm} className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-[14px] font-semibold text-slate-900">{t("admin.grantTitle")}</h2>
            <div className="mt-4 flex flex-col gap-3.5">
              <div>
                <label htmlFor="grant-user" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.selectUserLabel")}
                </label>
                <select
                  id="grant-user"
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
                >
                  <option value="">—</option>
                  {usersQuery.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="grant-role" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.roleLabel")}
                </label>
                <select
                  id="grant-role"
                  value={grantRole}
                  onChange={(e) => setGrantRole(e.target.value as Role)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
                >
                  <option value="">—</option>
                  {PLATFORM_ROLES.map((role) => (
                    <option key={role} value={role}>{roleLabel(role)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="grant-org-scope" className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  {t("admin.orgScopeLabel")}
                </label>
                <input
                  id="grant-org-scope"
                  value={grantScope}
                  onChange={(e) => setGrantScope(e.target.value)}
                  placeholder={t("admin.scopePlaceholder")}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
                />
              </div>
              <button
                type="submit"
                data-testid="grant-access"
                disabled={grantMutation.isPending}
                className="rounded-xl bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
              >
                {t("admin.grantButton")}
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
              {t("admin.grantsHistory")}
            </div>
            <table className="w-full text-start text-[13px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">{t("common.role")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("common.orgScope")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("common.actor")}</th>
                  <th className="px-4 py-2.5 text-start font-medium">{t("common.timestamp")}</th>
                </tr>
              </thead>
              <tbody>
                {grantsQuery.data?.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-600">{roleLabel(g.role)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{g.orgScope}</td>
                    <td className="px-4 py-2.5 text-slate-600">{g.grantedBy}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {new Date(g.grantedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {grantsQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
