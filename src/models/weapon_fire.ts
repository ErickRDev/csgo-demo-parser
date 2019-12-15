export class WeaponFire {
  tick: number;
  round: number;
  weapon: number;

  public static describeFields(delimiter: string = ';'): string {
    return [
      'tick',
      'round',
      'weapon'
    ].join(delimiter) + '\n';
  }
}