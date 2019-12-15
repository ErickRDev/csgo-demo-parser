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

export class Parser {
    public df: DemoFile;
    public verboseness: number;
    public delimiter: string = ';';

    public matchHasStarted: boolean = false;

    /* File streams */
    public tickStream: any;
    public playerDeathStream: any;
    public utilityLifecycleStream: any;
    public weaponFireStream: any;

    constructor(basePath: string, verboseness: number = 0) {
        this.df = new DemoFile();
        this.verboseness = verboseness;

        /* Ensuring staging directory exists */
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, { recursive: true });
        }

        /* Initializing streams & writing headers */
        // Tick table
        this.tickStream = fs.createWriteStream(path.join(basePath, 'tick.csv'));
        this.tickStream.write(Tick.describeFields(this.delimiter));

        // PlayerDeath table
        this.playerDeathStream = fs.createWriteStream(path.join(basePath, 'player_death.csv'));
        this.playerDeathStream.write(PlayerDeath.describeFields(this.delimiter));

        // UtilityLifecycle table
        this.utilityLifecycleStream = fs.createWriteStream(path.join(basePath, 'utility_lifecycle.csv'));
        this.utilityLifecycleStream.write(UtilityLifecycle.describeFields(this.delimiter));

        // WeaponFire table
        this.weaponFireStream = fs.createWriteStream(path.join(basePath, 'weapon_fire.csv'));
        this.weaponFireStream.write(WeaponFire.describeFields(this.delimiter));
    }

    public parse(buffer: Buffer): void {
        this.registerEvents();
        this.df.parse(buffer);
    }

    public registerEvents(): void {

        /** Fired when the game starts - pre warmup */
        this.df.on('start', () => {
            var mapHeader = this.df.header;
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
            var round = this.df.gameRules.roundsPlayed;
            if (round > 0 && this.verboseness > 0) {
                console.log(`Round ${round} started!`);
            }
        });

        /** Fired at the end of the match */
        this.df.on('end', e => {
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
        this.df.on('tickend', e => {
            if (!this.matchHasStarted) return;

            // skipping non-players (casters, GOTV, BOTs, etc) and players who are currently dead
            for (var player of _.filter(this.df.entities.players, (p) => p.health > 0)) {
                this.tickStream.write(this._parsePlayerInfo(player));
            }
        });

        /** Fired when the round officially ends */
        if (this.verboseness > 0) {
            this.df.gameEvents.on('round_officially_ended', (e) => {
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

            e['event'] = 'hegrenade_detonate'
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a flashbang is detonated */
        this.df.gameEvents.on('flashbang_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'flashbang_detonate'
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a smoke grenade expires */
        this.df.gameEvents.on('smokegrenade_expired', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'smokegrenade_expired'
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a smoke grenade detonates */
        this.df.gameEvents.on('smokegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'smokegrenade_detonate'
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a molotov detonates */
        this.df.gameEvents.on('molotov_detonate', (e) => {
            if (!this.matchHasStarted) return;

            e['event'] = 'molotov_detonate'
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(e));
        });

        /** Fired when a player dies */
        this.df.gameEvents.on('player_death', (e) => {
            if (!this.matchHasStarted) return;

            this.playerDeathStream.write(this._parsePlayerDeathEvent(e));

            var victim = this.df.entities.getByUserId(e.attacker);
            // saving last known stats of the killed player
            this.tickStream.write(this._parsePlayerInfo(victim));

            if (this.verboseness > 0) {
                var killerInfo = this.df.entities.getByUserId(e.userid);
                console.log(`${killerInfo.name} killed ${victim.name} with ${e.weapon}`);
            }
        });
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
    private _parseWeaponFireEvent(event: any): string {
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
    private _parsePlayerDeathEvent(event: any): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.userid,
            event.attacker,
            event.assister,
            event.weapon,
            event.headshot,
            event.penetrated
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a utility lifecycle event.
     * @param event The utility lifecycle event entity.
     */
    private _parseUtilityLifecycleEvent(event: any): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.event,
            event.eventId,
            event.x,
            event.y,
            event.z
        ].join(this.delimiter) + '\n';
    }
}