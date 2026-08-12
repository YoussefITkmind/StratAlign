export type MockIdpUser = {
  id: string;
  email: string;
  name: string;
  role: "platform_administrator" | "member";
};

const users: MockIdpUser[] = [
  {
    id: "oidc-user",
    email: "sso.member@stratalign.dev",
    name: "SSO Member",
    role: "member",
  },
  {
    id: "oidc-admin",
    email: "sso.admin@stratalign.dev",
    name: "SSO Admin",
    role: "platform_administrator",
  },
];

export function findMockIdpUser(userId: string) {
  return users.find((user) => user.id === userId);
}
