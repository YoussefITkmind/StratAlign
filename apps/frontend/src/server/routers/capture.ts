import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";
const id=z.string().uuid(); const backend=(ctx:{cookieHeader:string|null})=>createBackendRegistryClient(ctx.cookieHeader); const f=async<T>(op:()=>Promise<T>)=>{try{return await op();}catch(e){return translateBackendRegistryError(e);}};
export const captureRouter=router({
  detail:authenticatedProcedure.input(z.object({kpiDefinitionId:id}).strict()).query(({ctx,input})=>f(()=>backend(ctx).performance.detail.query(input))),
  addCommentary:authenticatedProcedure.input(z.object({kpiVersionId:z.string(),scopeNodeId:z.string(),period:z.string(),bodyEn:z.string().optional(),bodyAr:z.string().optional()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.commentary.add.mutate(input))),
  tasks:authenticatedProcedure.query(({ctx})=>f(()=>backend(ctx).performance.capture.tasks.query())),
  start:authenticatedProcedure.input(z.object({kpiVersionId:z.string(),scopeNodeId:z.string(),period:z.string(),recallDeadlineAt:z.coerce.date().optional()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.startSession.mutate(input))),
  get:authenticatedProcedure.input(z.object({sessionId:id}).strict()).query(({ctx,input})=>f(()=>backend(ctx).performance.capture.getSession.query(input))),
  history:authenticatedProcedure.input(z.object({kpiVersionId:z.string(),scopeNodeId:z.string()}).strict()).query(({ctx,input})=>f(()=>backend(ctx).performance.capture.history.query(input))),
  saveDraft:authenticatedProcedure.input(z.object({sessionId:id,value:z.number(),evidenceRef:z.string().nullish()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.saveDraft.mutate(input))),
  submit:authenticatedProcedure.input(z.object({sessionId:id,value:z.number(),evidenceRef:z.string().optional()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.submit.mutate(input))),
  recall:authenticatedProcedure.input(z.object({sessionId:id}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.recall.mutate(input))),
  template:authenticatedProcedure.input(z.object({format:z.enum(["csv","xlsx"]),period:z.string(),priorValue:z.number().nullable()}).strict()).query(({ctx,input})=>f(()=>backend(ctx).performance.capture.template.query(input))),
  validate:authenticatedProcedure.input(z.object({base64:z.string(),format:z.enum(["csv","xlsx"]),expectedPeriod:z.string(),history:z.array(z.number()),sessionId:id.optional()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.validateTemplate.mutate(input))),
  uploadEvidence:authenticatedProcedure.input(z.object({sessionId:id,fileName:z.string(),contentType:z.string(),base64:z.string()}).strict()).mutation(({ctx,input})=>f(()=>backend(ctx).performance.capture.uploadEvidence.mutate(input))),
});
