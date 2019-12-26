export class UtilityLifecycle {
  tick: number;
  round: number;
  event: string;
  userId: string;
  x: number;
  y: number;
  z: number;

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