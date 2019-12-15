export class UtilityLifecycle {
  tick: number;
  round: number;
  event: string;
  userId: string;
  entityId: string;
  x: number;
  y: number;
  z: number;

  public static describeFields(delimiter = ';'): string {
      return [
          'tick',
          'round',
          'event',
          'userId',
          'entityId',
          'x',
          'y',
          'z'
      ].join(delimiter) + '\n';
  }
}