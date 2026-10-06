import type { Clock } from '../../application/ports/out/Clock';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
