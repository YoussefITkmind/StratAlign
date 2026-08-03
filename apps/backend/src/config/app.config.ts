import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  nodeEnv: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  frontendUrl: process.env.FRONTEND_URL,
}));