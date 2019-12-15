export class BombLifecycle {
    public tick: number;
    public round: number;
    public event: string;
    public userId: number;

    public static describeFields(delimiter = ';'): string {
        return [
            'tick',
            'round',
            'event',
            'userId'
        ].join(delimiter) + '\n';
    }
}