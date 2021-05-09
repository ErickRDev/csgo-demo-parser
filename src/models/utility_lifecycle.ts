import { ParquetSchema } from 'parquets';

export class UtilityLifecycle {
  tick: number;
  round: number;
  event: string;
  userId: number;
  x: number;
  y: number;
  z: number;

  constructor(
    tick: number,
    round: number,
    event: string,
    userId: number,
    x: number,
    y: number,
    z: number
  ) {
    this.tick = tick;
    this.round = round;
    this.event = event;
    this.userId = userId;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public static describeFields(delimiter = ';'): string {
      return [
          'tick',
          'round',
          'event',
          'userId',
          'x',
          'y',
          'z'
      ].join(delimiter) + '\n';
  }
}

export const UtilityLifecycleSchema = new ParquetSchema({
  tick: { type: 'INT32' },
  round: { type: 'INT32' },
  event: { type: 'UTF8' },
  userId: { type: 'INT32', optional: true },
  x: { type: 'DOUBLE' },
  y: { type: 'DOUBLE' },
  z: { type: 'DOUBLE' },
});