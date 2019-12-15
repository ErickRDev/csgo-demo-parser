export class PlayerDeath {
  tick: number;
  round: number;
  user_id: string;
  attacker: number;
  assister: number;
  weapon: number;
  headshot: boolean;
  penetrated: boolean;

  public static describeFields(delimiter: string = ';') {
    return [
      'tick',
      'round',
      'user_id',
      'attacker',
      'assister',
      'weapon',
      'headshot',
      'penetrated'
    ].join(delimiter) + '\n';
  }
}