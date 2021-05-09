import { ParquetSchema } from 'parquets';

export class WeaponFire {
  tick: number;
  round: number;
  userId: number;
  weapon: string;

  constructor(tick: number, round: number, userId: number, weapon: string) {
    this.tick = tick;
    this.round = round;
    this.userId = userId;
    this.weapon = weapon;
  }

  public static describeFields(delimiter = ';'): string {
      return [
          'tick',
          'round',
          'userId',
          'weapon'
      ].join(delimiter) + '\n';
  }
}

export const WeaponFireSchema = new ParquetSchema({
  tick: { type: 'INT32' },
  round: { type: 'INT32' },
  userId: { type: 'INT32' },
  weapon: { type: 'UTF8' },
});