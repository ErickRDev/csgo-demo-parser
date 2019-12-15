export class UtilityLifecycle {
  tick: number;
  round: number;
  event: number;
  entity_id: string;
  x: number;
  y: number;
  z: number;

  public static describeFields(delimiter: string = ';') {
    return [
      'tick',
      'round',
      'event',
      'entity_id',
      'x',
      'y',
      'z'
    ].join(delimiter) + '\n';
  }
}