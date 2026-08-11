import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";
import request from "supertest";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { evidenceUploadsRouter } from "../src/routes/evidence-uploads.js";
import type { PrivateStorage } from "../src/services/storage.js";

function testApp(assignedProfessionalId = "11111111-1111-4111-8111-111111111111") {
  const queries: string[] = [];
  const runQuery = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM milestones m")) {
      return {
        rows: [{
          assigned_professional_id: assignedProfessionalId,
          status: "PREVISTO",
          project_id: "22222222-2222-4222-8222-222222222222",
        }],
      };
    }
    return { rows: [] };
  };
  const database = {
    query: runQuery,
    async connect() {
      return {
        query: runQuery,
        release() {},
      };
    },
  } as unknown as Database;
  const storage = {
    async put(buffer: Buffer, originalName: string, contentType: string) {
      return {
        key: "2026-08/33333333-3333-4333-8333-333333333333",
        sizeBytes: buffer.length,
        contentType,
        originalName,
      };
    },
    async delete() {},
  } as unknown as PrivateStorage;
  const config = { MAX_UPLOAD_BYTES: 2_000_000 } as AppConfig;
  const app = express();
  app.use((req, _res, next) => {
    req.user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "pro@example.es",
      name: "Pro",
      role: "profesional",
      emailVerified: true,
      accountStatus: "ACTIVO",
      verificationStatus: "APROBADO",
    };
    next();
  });
  app.use("/api/v1", evidenceUploadsRouter(database, config, storage));
  return { app, queries };
}

test("el profesional asignado puede crear el fileId de evidencia que exige el hito", async () => {
  const { app, queries } = testApp();
  const response = await request(app)
    .post("/api/v1/milestones/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence-file")
    .attach("file", Buffer.from("evidencia-controlada"), { filename: "evidencia.pdf", contentType: "application/pdf" });

  assert.equal(response.status, 201, response.text);
  assert.match(response.body.fileId, /^[0-9a-f-]{36}$/i);
  assert.ok(queries.some((sql) => sql.includes("'HITO_EVIDENCIA'")));
  assert.ok(queries.some((sql) => sql.includes("INSERT INTO audit_events")));
  assert.ok(queries.includes("BEGIN"));
  assert.ok(queries.includes("COMMIT"));
});

test("un profesional no asignado no puede subir evidencia al hito", async () => {
  const { app } = testApp("99999999-9999-4999-8999-999999999999");
  const response = await request(app)
    .post("/api/v1/milestones/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/evidence-file")
    .attach("file", Buffer.from("evidencia"), { filename: "evidencia.pdf", contentType: "application/pdf" });
  assert.equal(response.status, 404, response.text);
});
