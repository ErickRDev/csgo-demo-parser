export class WeaponFire {
  tick: number;
  round: number;
  userid: number;
  weapon: number;

  public static describeFields(delimiter = ';'): string {
      return [
          'tick',
          'round',
          'userId',
          'weapon'
      ].join(delimiter) + '\n';
  }
}