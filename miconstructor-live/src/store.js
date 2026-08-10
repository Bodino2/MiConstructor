import crypto from 'node:crypto';
import { normalizeEmail } from './auth.js';

export class MemoryStore {
  constructor() {
    this.users = new Map();
    this.byEmail = new Map();
    this.professionalProfiles = new Map();
  }

  async init() {}
  async close() {}

  async createUser(input) {
    const email = normalizeEmail(input.email);
    if (this.byEmail.has(email)) throw new Error('email_exists');
    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash: input.passwordHash,
      role: input.role,
      fullName: input.fullName,
      phone: input.phone,
      privacyAcceptedAt: input.privacyAcceptedAt,
      termsAcceptedAt: input.termsAcceptedAt,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    if (user.role === 'PROFESSIONAL') {
      this.professionalProfiles.set(user.id, {
        userId: user.id,
        nifCif: input.nifCif,
        specialty: input.specialty,
        province: input.province,
        locality: input.locality,
        verificationStatus: 'PENDING',
        testStatus: 'PENDING'
      });
    }
    return user;
  }

  async findUserByEmail(email) {
    const id = this.byEmail.get(normalizeEmail(email));
    return id ? this.users.get(id) : null;
  }

  async getUserById(id) {
    return this.users.get(id) || null;
  }

  async getProfessionalProfile(userId) {
    return this.professionalProfiles.get(userId) || null;
  }
}

export class PostgresStore {
  constructor(databaseUrl = process.env.DATABASE_URL) {
    this.databaseUrl = databaseUrl;
    this.pool = null;
  }

  async init() {
    if (!this.databaseUrl) throw new Error('database_url_missing');
    const { Pool } = await import('pg');
    this.pool = new Pool({ connectionString: this.databaseUrl });
    await this.pool.query('select 1');
  }

  async close() {
    await this.pool?.end();
  }

  async createUser(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `insert into users (email,password_hash,role,full_name,phone,privacy_accepted_at,terms_accepted_at)
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id,email,password_hash as "passwordHash",role,full_name as "fullName",phone,privacy_accepted_at as "privacyAcceptedAt",terms_accepted_at as "termsAcceptedAt",created_at as "createdAt"`,
        [normalizeEmail(input.email), input.passwordHash, input.role, input.fullName, input.phone, input.privacyAcceptedAt, input.termsAcceptedAt]
      );
      const user = userResult.rows[0];
      if (user.role === 'PROFESSIONAL') {
        await client.query(
          `insert into professional_profiles (user_id,nif_cif,specialty,province,locality)
           values ($1,$2,$3,$4,$5)`,
          [user.id, input.nifCif, input.specialty, input.province, input.locality]
        );
      }
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') throw new Error('email_exists');
      throw error;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email) {
    const result = await this.pool.query(
      `select id,email,password_hash as "passwordHash",role,full_name as "fullName",phone,privacy_accepted_at as "privacyAcceptedAt",terms_accepted_at as "termsAcceptedAt",created_at as "createdAt"
       from users where email=$1`,
      [normalizeEmail(email)]
    );
    return result.rows[0] || null;
  }

  async getUserById(id) {
    const result = await this.pool.query(
      `select id,email,password_hash as "passwordHash",role,full_name as "fullName",phone,privacy_accepted_at as "privacyAcceptedAt",terms_accepted_at as "termsAcceptedAt",created_at as "createdAt"
       from users where id=$1`, [id]
    );
    return result.rows[0] || null;
  }

  async getProfessionalProfile(userId) {
    const result = await this.pool.query(
      `select user_id as "userId",nif_cif as "nifCif",specialty,province,locality,verification_status as "verificationStatus",test_status as "testStatus"
       from professional_profiles where user_id=$1`, [userId]
    );
    return result.rows[0] || null;
  }
}

export function createStore() {
  return process.env.DATABASE_URL ? new PostgresStore() : new MemoryStore();
}
