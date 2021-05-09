import { ParquetSchema } from 'parquets';
import { Player } from 'demofile';

export class Tick {
    tick: number;
    round: number;
    userId: number;
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

    public static FromPlayer(tick: number, round: number, player: Player) {
        return new Tick(
            tick,
            round,
            player.userId,
            player.steamId,
            player.name,
            player.health,
            player.eyeAngles.pitch,
            player.eyeAngles.yaw,
            player.speed,
            player.position.x,
            player.position.y,
            player.position.z,
            player.placeName
        );
    }

    constructor(
        tick: number,
        round: number,
        userId: number,
        steamId: string,
        userName: string,
        health: number,
        pitch: number,
        yaw: number,
        speed: number,
        x: number,
        y: number,
        z: number,
        placeName: string
    ) {
        this.tick = tick;
        this.round = round;
        this.userId = userId;
        this.steamId = steamId;
        this.userName = userName;
        this.health = health;
        this.pitch = pitch;
        this.yaw = yaw;
        this.speed = speed;
        this.x = x;
        this.y = y;
        this.z = z;
        this.placeName = placeName;
    }

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

export const TickSchema = new ParquetSchema({
  tick: { type: 'INT32' },
  round: { type: 'INT32' },
  userId: { type: 'INT32' },
  steamId: { type: 'UTF8' },
  userName: { type: 'UTF8' },
  health: { type: 'INT32' },
  pitch: { type: 'DOUBLE' },
  yaw: { type: 'DOUBLE' },
  speed: { type: 'DOUBLE' },
  x: { type: 'DOUBLE' },
  y: { type: 'DOUBLE' },
  z: { type: 'DOUBLE' },
  placeName: { type: 'UTF8' },
});