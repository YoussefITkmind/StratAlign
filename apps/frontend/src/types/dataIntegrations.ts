export type ConnectionStatus = "Connected" | "Error" | "Disconnected" | "Pending";

export type Connection = {
  id: string;
  name: string;
  category: string;
  status: ConnectionStatus;
  direction: string;
  lastSync: string;
  recordsIn: number;
  recordsOut: number;
  meta: string;
  color: string;
  icon: string;
};

export type LogStatus = "Success" | "Failed" | "Partial" | "Running";

export type SyncLog = {
  id: string;
  integration: string;
  started: string;
  duration: string;
  status: LogStatus;
  recordsIn?: number;
  recordsOut?: number;
  errors?: number;
  message: string;
  color: string;
  icon: string;
};

export type ApiKeyScope = "ADMIN" | "READ" | "WRITE";

export type ApiKey = {
  id: string;
  name: string;
  scope: ApiKeyScope;
  key: string;
  owner: string;
  created: string;
  expires: string;
  lastUsed: string;
  requests: number;
  disabled: boolean;
};

export type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  successRate: number;
};
