export class PlayerDeath {
  tick: number;
  round: number;
  userId: string;
  attacker: number;
  assister: number;
  assistedFlash: number;
  weapon: number;
  headshot: boolean;
  penetrated: boolean;

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