import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SessionsService } from './sessions.service';

const SWEEP_MS = 1000;

@Injectable()
export class SessionDeadlineService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly sessions: SessionsService) {}

  onModuleInit() {
    void this.sessions.sweepDue();
    this.timer = setInterval(() => {
      void this.sessions.sweepDue();
    }, SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
