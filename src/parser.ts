import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';
import { 
    DemoFile, 
    Player,
    Weapon
} from 'demofile'; 

/* Models */
import { PlayerDeath } from './models/player_death';
import { Tick } from './models/tick';
import { UtilityLifecycle } from './models/utility_lifecycle';
import { WeaponFire } from './models/weapon_fire';
import { BombLifecycle } from './models/bomb_lifecycle';

/**
 * The parser class.
 * Responsible for parsing demo files.
 */
export class Parser {
    public df: DemoFile;
    public delimiter = ';';
    public stagingArea: string;
    public verboseness: number;

    /* Auxiliary structures */
    public matchHasStarted = false;
    public utilitiesIndex: Map<string, string>;

    /* Simple accessors for data in DemoFile */
    public currentRound = (): number => this.df.gameRules.roundsPlayed;
    public currentTick = (): number => this.df.currentTick;

    /* File streams */
    public tickStream;
    public playerDeathStream;
    public utilityLifecycleStream;
    public weaponFireStream;
    public bombLifecycleStream;

    /* Debug message templates */
    UTILITY_LIFECYCLE_TEXT = (event: UtilityLifecycle): string => {
        return `User=${event.userId}; Event=${event.event};`;
    };

    /**
     *
     * @param stagingArea - The directory used as a staging area {storing parsed data, etc}
     * @param verboseness - The verboseness configured level
     */
    constructor(stagingArea: string, verboseness = 0) {
        this.verboseness = verboseness;
        this.df = new DemoFile();
        this.stagingArea = stagingArea;

        /* Ensuring staging directory exists */
        if (!fs.existsSync(stagingArea)) {
            fs.mkdirSync(stagingArea, { recursive: true });
        }

        /* Constructing utilities index */
        this.utilitiesIndex = new Map<string, string>();
        this.utilitiesIndex.set('weapon_decoy', 'decoy');
        this.utilitiesIndex.set('weapon_flashbang', 'flashbang');
        this.utilitiesIndex.set('weapon_hegrenade', 'hegrenade');
        this.utilitiesIndex.set('weapon_incgrenade', 'inferno');
        this.utilitiesIndex.set('weapon_molotov', 'molotov');
        this.utilitiesIndex.set('weapon_smokegrenade', 'smokegrenade');

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

        /** Fired when the match actually starts - post warmup */
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

            const weapon: Weapon = this.df.entities.getByUserId(e.userid).weapon;

            if (weapon && this.utilitiesIndex.has(weapon.className)) {
                // A utility was thrown,
                //  generating utility lifecycle event:
                const utilityThrownEvent: UtilityLifecycle = this._genUtilityThrownEvent(
                    weapon,
                    e.userid,
                    [
                        weapon.owner.position.x,
                        weapon.owner.position.y,
                        weapon.owner.position.z
                    ]
                );
                this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(utilityThrownEvent));

                if (this.verboseness > 0) {
                    console.log(this.UTILITY_LIFECYCLE_TEXT(utilityThrownEvent));
                }
            }

            this.weaponFireStream.write(this._parseWeaponFireEvent(e));
        });

        // TODO: Place this method elsewhere!
        /**
         * Handles an event lifecycle event by generating an encapsulating relevant info
         * in an object, writing to stream and logging to screen (if set to)
         * @param eventName - The event name
         * @param eventInfo - Information regarding the event
         */
        const handleUtilityLifecycleEvent = (eventName: string, eventInfo): void => {
            const utilityLifecycleEvent: UtilityLifecycle = {
                tick: this.currentTick(),
                round: this.currentRound(),
                event: eventName,
                userId: eventInfo.userid,
                x: eventInfo.x,
                y: eventInfo.y,
                z: eventInfo.z
            };
            this.utilityLifecycleStream.write(this._parseUtilityLifecycleEvent(utilityLifecycleEvent));

            if (this.verboseness > 0) {
                console.log(this.UTILITY_LIFECYCLE_TEXT(utilityLifecycleEvent));
            }
        };

        /** Fired when an HE is detonated */
        this.df.gameEvents.on('hegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('hegrenade_detonate', e);
        });

        /** Fired when a flashbang is detonated */
        this.df.gameEvents.on('flashbang_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('flashbang_detonate', e);
        });

        /** Fired when a smoke grenade expires */
        this.df.gameEvents.on('smokegrenade_expired', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('smokegrenade_expired', e);
        });

        /** Fired when a smoke grenade detonates */
        this.df.gameEvents.on('smokegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('smokegrenade_detonate', e);
        });

        // /** Fired when a molotov detonates */
        // this.df.gameEvents.on('molotov_detonate', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('molotov_detonate', e);
        // });

        /** Fired when an inferno starts burning */
        this.df.gameEvents.on('inferno_startburn', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('inferno_startburn', e);
        });

        /** Fired when an inferno expires */
        this.df.gameEvents.on('inferno_expire', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('inferno_expire', e);
        });

        // /** Fired when an inferno extinguishes */
        // this.df.gameEvents.on('inferno_extinguish', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('inferno_extinguish', e);
        // });

        /** Fired when a decoy starts firing */
        this.df.gameEvents.on('decoy_started', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('decoy_started', e);
        });

        // /** Fired when a decoy is firing */
        // this.df.gameEvents.on('decoy_firing', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('decoy_firing', e);
        // });

        /** Fired when a decoy detonates */
        this.df.gameEvents.on('decoy_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('decoy_detonate', e);
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

        /** When a player gets hurt */
        this.df.gameEvents.on('player_hurt', (e) => {
            if (this.verboseness > 0) {
                console.log(e);
            }
        });

        /** When a plyer is blinded */
        this.df.gameEvents.on('player_blind', (e) => {
            if (this.verboseness > 0) {
                console.log(e);
            }
        });
    }

    /**
     * Generates an event encapsulating information regarding the thrown grenade
     * @param weapon - The weapon used
     * @param userId - The unique handle (in this match) for the user responsible for triggering the event
     */
    private _genUtilityThrownEvent(
        weapon: Weapon,
        userId: number,
        position: [number, number, number]
    ): UtilityLifecycle {
        // Checking the grenades index
        if (!this.utilitiesIndex.has(weapon.className)) {
            return undefined;
        }

        const utility: string = this.utilitiesIndex.get(weapon.className);

        // Generating utility lifecycle event for 'grenade thrown' scenarios
        const utilityLifecycleEvent: UtilityLifecycle = {
            tick: this.currentTick(),
            round: this.currentRound(),
            event: `${utility}_thrown`,
            userId: userId?.toString() || '',
            x: position[0],
            y: position[1],
            z: position[2]
        };

        return utilityLifecycleEvent;
    }

    /**
     * Parses a player entity for its state in the game on the current tick.
     * @param player - The player entity.
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
     * @param event - The weapon fire event entity.
     */
    private _parseWeaponFireEvent(event): string {
        return [
            this.df.currentTick,
            this.df.gameRules.roundsPlayed,
            event.userid,
            event.weapon
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a player death event.
     * @param event - The player death event entity.
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
     * @param event - The utility lifecycle event entity.
     */
    private _parseUtilityLifecycleEvent(event: UtilityLifecycle): string {
        return [
            this.currentTick(),
            this.currentRound(),
            event.event,
            event.userId,
            event.x,
            event.y,
            event.z
        ].join(this.delimiter) + '\n';
    }

    /**
     * Parses a bomb lifecycle event.
     * @param event - The bomb lifecycle event entity.
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