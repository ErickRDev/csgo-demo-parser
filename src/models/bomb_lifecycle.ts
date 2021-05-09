import { ParquetSchema } from 'parquets';

export class BombLifecycle {
    public tick: number;
    public round: number;
    public event: string;
    public userId: number;

    constructor (tick: number, round: number, event: string, userId: number) {
        this.tick = tick;
        this.round = round;
        this.event = event;
        this.userId = userId;
    }

    public static describeFields(delimiter = ';'): string {
        return [
            'tick',
            'round',
            'event',
            'userId'
        ].join(delimiter) + '\n';
    }
}

export const BombLifecycleSchema = new ParquetSchema({
  tick: { type: 'INT32' },
  round: { type: 'INT32' },
  event: { type: 'UTF8' },
  userId: { type: 'INT32' },
});