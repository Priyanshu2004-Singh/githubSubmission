import crypto from 'crypto';
import Database from 'better-sqlite3';

export interface IdempotencyResult<T> {
  cached: boolean;
  statusCode: number;
  data: T;
}

export class IdempotencyService {
  /**
   * Generates a deterministic hash for a given endpoint and request payload.
   */
  static hashRequest(endpoint: string, payload: any): string {
    const serialized = JSON.stringify(payload ?? {});
    return crypto.createHash('sha256').update(`${endpoint}::${serialized}`).digest('hex');
  }

  /**
   * Wraps an asynchronous operation with idempotency enforcement.
   */
  static async executeWithIdempotency<T>(
    db: Database.Database,
    key: string | null | undefined,
    endpoint: string,
    payload: any,
    operation: () => Promise<{ statusCode: number; data: T }>
  ): Promise<IdempotencyResult<T>> {
    // If no idempotency key was supplied by client, execute directly without caching
    if (!key || typeof key !== 'string' || key.trim() === '') {
      const res = await operation();
      return { cached: false, statusCode: res.statusCode, data: res.data };
    }

    const cleanKey = key.trim();
    const requestHash = this.hashRequest(endpoint, payload);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24hr TTL

    // 1. Check existing record
    const existing = db.prepare('SELECT * FROM idempotency_records WHERE key = ?').get(cleanKey) as any;

    if (existing) {
      if (existing.status === 'COMPLETED') {
        const cachedData = existing.response_body ? JSON.parse(existing.response_body) : null;
        return {
          cached: true,
          statusCode: existing.response_status || 200,
          data: cachedData,
        };
      }

      if (existing.status === 'PROCESSING') {
        // If request is still processing within 15 seconds, reject duplicate
        const ageMs = Date.now() - new Date(existing.created_at).getTime();
        if (ageMs < 15000) {
          throw new Error('CONCURRENT_DUPLICATE_REQUEST: Another request with the same Idempotency-Key is currently in progress.');
        }
      }
    }

    // 2. Claim idempotency key atomically with PROCESSING state
    try {
      db.prepare(`
        INSERT INTO idempotency_records (key, endpoint, request_hash, status, created_at, expires_at)
        VALUES (?, ?, ?, 'PROCESSING', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          status = 'PROCESSING',
          created_at = excluded.created_at
        WHERE idempotency_records.status != 'COMPLETED'
      `).run(cleanKey, endpoint, requestHash, now, expiresAt);
    } catch (err: any) {
      throw new Error(`IDEMPOTENCY_LOCK_FAILED: ${err.message}`);
    }

    // 3. Execute the operation
    try {
      const res = await operation();

      // 4. Save completed response
      db.prepare(`
        UPDATE idempotency_records
        SET status = 'COMPLETED',
            response_status = ?,
            response_body = ?
        WHERE key = ?
      `).run(res.statusCode, JSON.stringify(res.data), cleanKey);

      return { cached: false, statusCode: res.statusCode, data: res.data };
    } catch (err: any) {
      // 5. On failure, mark record as FAILED so client can retry
      try {
        db.prepare(`
          UPDATE idempotency_records
          SET status = 'FAILED',
              response_status = 500,
              response_body = ?
          WHERE key = ?
        `).run(JSON.stringify({ error: err.message }), cleanKey);
      } catch (e) {
        // ignore rollback errors
      }
      throw err;
    }
  }
}
