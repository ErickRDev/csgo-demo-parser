import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';
import { 
    DemoFile, 
    Player
} from 'demofile'; 

/* Models */
import { PlayerDeath } from './models/player_death';
import { Tick } from './models/tick';
import { UtilityLifecycle } from './models/utility_lifecycle';
import { WeaponFire } from './models/weapon_fire';
import { BombLifecycle } from './models/bomb_lifecycle';

export class Parser {
    public verboseness: number;
    public df: DemoFile;
    public delimiter = ';';
    public stagingArea: string;

    public matchHasStarted = false;

    /* File streams */
    public tickStream;
    public playerDeathStream;
    public utilityLifecycleStream;
    public weaponFireStream;
    public bombLifecycleStream;

    constructor(stagingArea: string, verboseness = 0) {
        this.verboseness = verboseness;
        this.df = new DemoFile();
        this.stagingArea = stagingArea;

        /* Ensuring staging directory exists */
        if (!fs.existsSync(stagingArea)) {
            fs.mkdirSync(stagingArea, { recursive: true });
        }

        /* Initializing streams & writing headers */
        // Tick table
        this.tickStream = fs.createWriteStream(path.join(stagingArea, 'tick.csv'));
        this.tickStream.write(Tick.describeFields(this.delimiter));

        // PlayerDeath table
        this.playerDeathStream = fs.createWriteStream(path.join(stagingArea, 'player_death.csv'));
        this.playerDeathStream.write(PlayerDeath.describeFields(this.delimiter));

        // UtilityLifecycle table
        this.utilityLifecycleStream = fs.createWriteStream(path.join(stagingArea, 'utility_lifecycle.csv'));
        this.utilityLifecycleStream.write(UtilityLifecycle.describeFields(this.delimiter));

        // WeaponFire table
        this.weaponFireStream = fs.createWriteStream(path.join(stagingArea, 'weapon_fire.csv'));
        this.weaponFireStream.write(WeaponFire.describeFields(this.delimiter));

        // BombLifecycle table
        this.bombLifecycleStream = fs.createWriteStream(path.join(stagingArea, 'bomb_lifecycle.csv'));
        this.bombLifecycleStream.write(BombLifecycle.describeFields(this.delimiter));
    }

    public parse(buffer: Buffer): void {
        this.registerEvents();
        this.df.parse(buffer);
    }

    public registerEvents(): void {

        /** (?) Fired when the game events list is produced */
        this.df.on('svc_GameEventList', () => {
            const ws = fs.createWriteStream(path.join(this.stagingArea, 'events_dump.csv'));
            this.df.gameEvents.gameEventList.forEach((event) => {
                ws.write(event.name + '\n');
            });
            ws.close();
        });

        /** Fired when the game starts - pre warmup */
        this.df.on('start', () => {
            const mapHeader = this.df.header;
            if (this.verboseness > 0) {
                console.log('Parsing started!');
                console.log(mapHeader);
            }
        });

        /** Fired when the match actually starts - after warmup */
        this.df.gameEvents.on('round_announce_match_start', () => {
            this.matchHasStarted = true;
            if (this.verboseness > 0) {
                console.log('Match has started!');
            }
        });
  
        /** Fired at the start of the round */
        this.df.gameEvents.on('round_start', () => {
            const round = this.df.gameRules.roundsPlayed;
            if (round > 0 && this.verboseness > 0) {
                console.log(`Round ${round} started!`);
            }
        });

        /** Fired at the end of the match */
        this.df.on('end', (e) => {
            if (e.error) {
                console.log(e.error);
                return;
            }

            // Closing data streams
            this.tickStream.close();
            this.playerDeathStream.close();
            this.weaponFireStream.close();
            this.utilityLifecycleStream.close();

            if (this.verboseness > 0) {
                console.log('Parsing ended!');
                console.log('Dumping parsed content..');
            }
        });

        /** Fired at the end of every tick */
        this.df.on('tickend', () => {
            if (!this.matchHasStarted) return;

            // skipping non-players (casters, GOTV, BOTs, etc) and players who are currently dead
            for (const player of _.filter(this.df.entities.players, (p) => p.health > 0)) {
                this.tickStream.write(this._parsePlayerInfo(player));
            }
        });

        /** Fired when the round officially ends */
        if (this.verboseness > 0) {
            this.df.gameEvents.on('round_officially_ended', () => {
                console.log('\tRound ended!');
            });
        }

        /** Fired when a weapon is fired */
        this.df.gameEvents.on('weapon_fire', (e) => {
            if (!this.matchHasStarted) return;

            this.weaponFireStream.write(this._parseWeaponFireEvent(e));
        });

        /** Fired when an HE is detonated */
        this.df.gameEvents.on('hegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'hegrenade_detonate';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a flashbang is detonated */
        this.df.gameEvents.on('flashbang_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'flashbang_detonate';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a smoke grenade expires */
        this.df.gameEvents.on('smokegrenade_expired', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'smokegrenade_expired';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a smoke grenade detonates */
        this.df.gameEvents.on('smokegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'smokegrenade_detonate';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a molotov detonates */
        this.df.gameEvents.on('molotov_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'molotov_detonate';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when an inferno starts burning */
        this.df.gameEvents.on('inferno_startburn', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'inferno_startburn';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when an inferno expires */
        this.df.gameEvents.on('inferno_expire', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'inferno_expire';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when an inferno extinguishes */
        this.df.gameEvents.on('inferno_extinguish', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'inferno_extinguish';
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when the bomb is planted */
        this.df.gameEvents.on('bomb_planted', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'bomb_planted';
            this.bombLifecycleStream.write(this._parseBombLifecycleEvent(e));
        });

        /** Fired when the bomb is defused */
        this.df.gameEvents.on('bomb_defused', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'bomb_defused';
            this.bombLifecycleStream.write(this._parseBombLifecycleEvent(e));
        });

        /** Fired when the bomb explodes */
        this.df.gameEvents.on('bomb_exploded', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'bomb_exploded';
            this.bombLifecycleStream.write(this._parseBombLifecycleEvent(e));
        });

        /** Fired when the bomb is dropped */
        this.df.gameEvents.on('bomb_dropped', (e) => { 
            if (!this.matchHasStarted) return;

            e['event'] = 'bomb_dropped';
            this.bombLifecycleStream.write(this._parseBombLifecycleEvent(e));
        });

        /** Fired when the bomb is picked up */
        this.df.gameEvents.on('bomb_pickup', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'bomb_pickup';
            this.bombLifecycleStream.write(this._parseBombLifecycleEvent(e));
        });

        /** Fired when a player dies */
        this.df.gameEvents.on('player_death', (e) => {
            if (!this.matchHasStarted) return;

            this.playerDeathStream.write(this._parsePlayerDeathEvent(e));

            const victim = this.df.entities.getByUserId(e.userid);
            // saving last known stats of the killed player
            this.tickStream.write(this._parsePlayerInfo(victim));

            if (this.verboseness > 0) {
                const killerInfo = this.df.entities.getByUserId(e.attacker);
                console.log(`${killerInfo.name} killed ${victim.name} with ${e.weapon}`);
            }
        });

        /** Other events that actually trigger */
        // this.df.gameEvents.on('player_hurt', () => console.log('player_hurt triggered'));
        // this.df.gameEvents.on('player_blind', () => console.log('player_blind triggered'));
        // this.df.gameEvents.on('round_start', () => console.log('round_start triggered'));
        // this.df.gameEvents.on('round_end', () => console.log('round_end triggered'));
    }

    /**
     * Parses a player entity for its state in the game on the current tick.
     * @param player The player entity.
     */
    private _parsePlayerInfo(player: Player): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
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
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a weapon fire event.
     * @param event The weapon fire event entity.
     */
    private _parseWeaponFireEvent(event): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.weapon
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a player death event.
     * @param event The player death event entity.
     */
    private _parsePlayerDeathEvent(event): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.userid,
            event.attacker,
            event.assister,
            event.assistedflash,
            event.weapon,
            event.headshot,
            event.penetrated
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a utility lifecycle event.
     * @param event The utility lifecycle event entity.
     */
    private _parseUtilityLifecycleEvent(event): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.event,
            event.userid,
            event.entityid,
            event.x,
            event.y,
            event.z
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a bomb lifecycle event.
     * @param event The bomb lifecycle event entity.
     */
    private _parseBombLifecycleEvent(event): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.event,
            event.userid
        ].join(this.delimiter) + '\n';
    }
}