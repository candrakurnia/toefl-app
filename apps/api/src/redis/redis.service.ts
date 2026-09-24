import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
  }

  async onModuleInit() {
    await this.ping();
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === 'wait' || this.client.status === 'end') {
        await this.client.connect();
      }
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis unavailable: ${message}`);
      return false;
    }
  }

  async rpush(key: string, value: string): Promise<boolean> {
    if (!(await this.ping())) return false;
    try {
      await this.client.rpush(key, value);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis RPUSH failed: ${message}`);
      return false;
    }
  }

  async lpush(key: string, value: string): Promise<boolean> {
    if (!(await this.ping())) return false;
    try {
      await this.client.lpush(key, value);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis LPUSH failed: ${message}`);
      return false;
    }
  }

  async lpop(key: string): Promise<string | null> {
    if (!(await this.ping())) return null;
    try {
      return await this.client.lpop(key);
    } catch {
      return null;
    }
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    if (!(await this.ping())) return;
    try {
      await this.client.set(key, value, 'EX', ttlSec);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis SET failed: ${message}`);
    }
  }

  /** Earliest section or overall deadline, in epoch milliseconds. */
  async zadd(key: string, score: number, member: string): Promise<void> {
    if (!(await this.ping())) return;
    try {
      await this.client.zadd(key, score, member);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis ZADD failed: ${message}`);
    }
  }

  async zrem(key: string, member: string): Promise<void> {
    if (!(await this.ping())) return;
    try {
      await this.client.zrem(key, member);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis ZREM failed: ${message}`);
    }
  }

  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    if (!(await this.ping())) return [];
    try {
      return await this.client.zrangebyscore(key, min, max);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis ZRANGEBYSCORE failed: ${message}`);
      return [];
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
