import { ParquetSchema } from 'parquets';

export class PlayerDeath {
  tick: number;
  round: number;
  userId: number;
  attacker: number;
  assister: number;
  assistedFlash: boolean;
  weapon: string;
  headshot: boolean;
  penetrated: number;

  constructor(
    tick: number,
    round: number,
    userId: number,
    attacker: number,
    assister: number,
    assistedFlash: boolean,
    weapon: string,
    headshot: boolean,
    penetrated: number
  ) {
    this.tick = tick;
    this.round = round;
    this.userId = userId;
    this.attacker = attacker;
    this.assister = assister;
    this.assistedFlash = assistedFlash;
    this.weapon = weapon;
    this.headshot = headshot;
    this.penetrated = penetrated;
  }

  public static describeFields(delimiter = ';'): string {
      return [
          'tick',
          'round',
          'userId',
          'attacker',
          'assister',
          'assistedFlash',
          'weapon',
          'headshot',
          'penetrated'
      ].join(delimiter) + '\n';
  }
}

export const PlayerDeathSchema = new ParquetSchema({
  tick: { type: 'INT32' },
  round: { type: 'INT32' },
  userId: { type: 'INT32' },
  attacker: { type: 'INT32' },
  assister: { type: 'INT32' },
  assistedFlash: { type: 'BOOLEAN' },
  weapon: { type: 'UTF8' },
  headshot: { type: 'BOOLEAN' },
  penetrated: { type: 'INT32' },
});