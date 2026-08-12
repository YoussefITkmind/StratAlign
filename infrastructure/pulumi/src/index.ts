import * as command from "@pulumi/command";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

const stack = pulumi.getStack();

/*
 * Prompt 0.9 scope:
 *
 * DEV data/storage tier only.
 * Application runtime/compute is deliberately not provisioned here.
 *
 * The Docker provider is used for the local DEV implementation so the
 * infrastructure can run in Codespaces and on every team member's machine.
 */

const postgresPort = config.requireNumber("postgresPort");
const redisPort = config.requireNumber("redisPort");
const minioApiPort = config.requireNumber("minioApiPort");
const minioConsolePort = config.requireNumber("minioConsolePort");

const postgresUser = config.require("postgresUser");
const postgresDatabase = config.require("postgresDatabase");
const postgresPassword = config.requireSecret("postgresPassword");
const minioRootUser = config.requireSecret("minioRootUser");
const minioRootPassword = config.requireSecret("minioRootPassword");

const postgresImageName = config.require("postgresImage");
const redisImageName = config.require("redisImage");
const minioImageName = config.require("minioImage");
const minioClientImageName = config.require("minioClientImage");

const networkName = `stratalign-pulumi-${stack}`;

const network = new docker.Network("data-storage-network", {
  name: networkName,
});

const postgresData = new docker.Volume("postgres-data", {
  name: `stratalign-pulumi-${stack}-postgres-data`,
});

const redisData = new docker.Volume("redis-data", {
  name: `stratalign-pulumi-${stack}-redis-data`,
});

const minioData = new docker.Volume("minio-data", {
  name: `stratalign-pulumi-${stack}-minio-data`,
});

const postgresImage = new docker.RemoteImage("postgres-image", {
  name: postgresImageName,
  keepLocally: true,
});

const redisImage = new docker.RemoteImage("redis-image", {
  name: redisImageName,
  keepLocally: true,
});

const minioImage = new docker.RemoteImage("minio-image", {
  name: minioImageName,
  keepLocally: true,
});

const postgres = new docker.Container("postgres", {
  name: `stratalign-pulumi-${stack}-postgres`,
  image: postgresImage.imageId,

  envs: [
    `POSTGRES_USER=${postgresUser}`,
    pulumi.interpolate`POSTGRES_PASSWORD=${postgresPassword}`,
    `POSTGRES_DB=${postgresDatabase}`,
  ],

  ports: [
    {
      internal: 5432,
      external: postgresPort,
    },
  ],

  mounts: [
    {
      type: "volume",
      source: postgresData.name,
      target: "/var/lib/postgresql/data",
    },
  ],

  networksAdvanced: [
    {
      name: network.name,
    },
  ],

  restart: "unless-stopped",
});

const redis = new docker.Container("redis", {
  name: `stratalign-pulumi-${stack}-redis`,
  image: redisImage.imageId,

  command: [
    "redis-server",
    "--appendonly",
    "yes",
  ],

  ports: [
    {
      internal: 6379,
      external: redisPort,
    },
  ],

  mounts: [
    {
      type: "volume",
      source: redisData.name,
      target: "/data",
    },
  ],

  networksAdvanced: [
    {
      name: network.name,
    },
  ],

  restart: "unless-stopped",
});

const minioContainerName =
  `stratalign-pulumi-${stack}-minio`;

const minio = new docker.Container("minio", {
  name: minioContainerName,
  image: minioImage.imageId,

  envs: [
    pulumi.interpolate`MINIO_ROOT_USER=${minioRootUser}`,
    pulumi.interpolate`MINIO_ROOT_PASSWORD=${minioRootPassword}`,
  ],

  command: [
    "server",
    "/data",
    "--console-address",
    ":9001",
  ],

  ports: [
    {
      internal: 9000,
      external: minioApiPort,
    },
    {
      internal: 9001,
      external: minioConsolePort,
    },
  ],

  mounts: [
    {
      type: "volume",
      source: minioData.name,
      target: "/data",
    },
  ],

  networksAdvanced: [
    {
      name: network.name,
    },
  ],

  restart: "unless-stopped",
});

/*
 * Object-storage layout required by the later ingestion/reporting phases:
 *
 * raw
 * conformed
 * artifacts
 * journal-worm
 *
 * journal-worm uses MinIO object locking and a default COMPLIANCE
 * retention policy. The lowercase spelling is intentional because
 * S3-compatible bucket names must be lowercase.
 */

const minioHost = pulumi.interpolate`http://${minioRootUser}:${minioRootPassword}@${minioContainerName}:9000`;

const bucketBootstrap =
  new command.local.Command(
    "object-storage-buckets",
    {
      environment: {
        MINIO_HOST: minioHost,
      },

      create: pulumi.interpolate`
set -eu

echo "Waiting for MinIO..."

until docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  ready local >/dev/null 2>&1
do
  sleep 2
done

echo "Creating standard buckets..."

docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  mb --ignore-existing local/raw

docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  mb --ignore-existing local/conformed

docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  mb --ignore-existing local/artifacts

echo "Creating WORM journal bucket..."

docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  mb --ignore-existing \
  --with-lock \
  local/journal-worm

docker run --rm \
  --network ${network.name} \
  -e "MC_HOST_local=$MINIO_HOST" \
  ${minioClientImageName} \
  retention set \
  --default \
  COMPLIANCE \
  30d \
  local/journal-worm

echo "Object-storage buckets ready."
`,

      triggers: [
        minio.id,
      ],
    },
    {
      dependsOn: [
        minio,
      ],
    },
  );

export const environment = stack;

export const infrastructureTier = "data-storage";

export const runtimeProvisioned = false;

export const databaseUrl = pulumi.secret(
  pulumi.interpolate`postgresql://${postgresUser}:${postgresPassword}@localhost:${postgresPort}/${postgresDatabase}`,
);

export const redisUrl =
  pulumi.interpolate`redis://localhost:${redisPort}`;

export const objectStorageEndpoint =
  pulumi.interpolate`http://localhost:${minioApiPort}`;

export const objectStorageConsole =
  pulumi.interpolate`http://localhost:${minioConsolePort}`;

export const objectStorageAccessKey =
  pulumi.secret(minioRootUser);

export const objectStorageSecretKey =
  minioRootPassword;

export const objectStorageBuckets = {
  raw: "raw",
  conformed: "conformed",
  artifacts: "artifacts",
  journalWorm: "journal-worm",
};

export const journalWormRetention =
  "COMPLIANCE 30d";

export const postgresContainerId = postgres.id;
export const redisContainerId = redis.id;
export const minioContainerId = minio.id;
export const storageBootstrapId = bucketBootstrap.id;
