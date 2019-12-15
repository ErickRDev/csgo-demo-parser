export class Tick {
    tick: number;
    round: number;
    user_id: string;
    steam_id: string;
    user_name: string;
    health: number;
    pitch: number;
    yaw: number;
    speed: number;
    x: number;
    y: number;
    z: number;
    place_name: string;

    public static describeFields(delimiter = ';'): string {
        return [
            'tick', 
            'round', 
            'user_id',
            'steam_id',
            'user_name',
            'health',
            'pitch',
            'yaw',
            'speed',
            'x',
            'y',
            'z',
            'place_name'
        ].join(delimiter) + '\n';
    }
}