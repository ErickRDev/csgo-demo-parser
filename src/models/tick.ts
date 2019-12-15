export class Tick {
    tick: number;
    round: number;
    userId: string;
    steamId: string;
    userName: string;
    health: number;
    pitch: number;
    yaw: number;
    speed: number;
    x: number;
    y: number;
    z: number;
    placeName: string;

    public static describeFields(delimiter = ';'): string {
        return [
            'tick', 
            'round', 
            'userId',
            'steamId',
            'userName',
            'health',
            'pitch',
            'yaw',
            'speed',
            'x',
            'y',
            'z',
            'placeName'
        ].join(delimiter) + '\n';
    }
}