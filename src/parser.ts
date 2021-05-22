import * as path from 'path';
import * as fs from 'fs';
import * as _ from 'lodash';
import { ParquetWriter, ParquetWriterOptions } from 'parquets';
import { DemoFile, Player, Weapon } from 'demofile'; 

/* Models */
import { PlayerDeath, PlayerDeathSchema } from './models/player_death';
import { Tick, TickSchema } from './models/tick';
import { UtilityLifecycle, UtilityLifecycleSchema } from './models/utility_lifecycle';
import { WeaponFire, WeaponFireSchema } from './models/weapon_fire';
import { BombLifecycle, BombLifecycleSchema } from './models/bomb_lifecycle';

/**
 * The parser class.
 * Responsible for parsing demo files.
 */
export class Parser {
    public Ready: Promise<any>;

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
    public tickWriter: ParquetWriter<Tick>;
    public playerDeathWriter: ParquetWriter<PlayerDeath>;
    public utilityLifecycleWriter: ParquetWriter<UtilityLifecycle>;
    public weaponFireWriter: ParquetWriter<WeaponFire>;
    public bombLifecycleWriter: ParquetWriter<BombLifecycle>;

    /* Debug message templates */
    UTILITY_LIFECYCLE_TEXT = (event: UtilityLifecycle): string => {
        return `User=${event.userId}; Event=${event.event};`;
    };

    /**
     * Constructor.
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

        // Leveraging the "object readiness" design pattern
        this.Ready = new Promise((resolve, reject) => {
            this.initializeParquetStreams(stagingArea)
                .then(() => resolve(undefined))
                .catch(() => reject());
        });
    }

    /**
     * Initializes the parquet file streams.
     * @param stagingArea - The directory used as a staging area for the parsed data.
     * @returns - A promise indicating that the parquet file streams were initialized successfuly or not.
     */
    private initializeParquetStreams(stagingArea: string): Promise<void[]> {
        let promises = [];

        // Aiming for 1GB row groups
        let opts: ParquetWriterOptions = {
            rowGroupSize: 1073741824,
        };

        promises.push(
            ParquetWriter.openFile(TickSchema, path.join(stagingArea, 'tick.parquet'), opts)
            .then((writer) => this.tickWriter = writer)
            .catch((err) => console.log(err))
        );

        promises.push(
            ParquetWriter.openFile(PlayerDeathSchema, path.join(stagingArea, 'player_death.parquet'))
            .then((writer) => this.playerDeathWriter = writer)
            .catch((err) => console.log(err))
        );

        promises.push(
            ParquetWriter.openFile(UtilityLifecycleSchema, path.join(stagingArea, 'utility_lifecycle.parquet'))
                .then((writer) => this.utilityLifecycleWriter = writer)
                .catch((err) => console.log(err))
        );

        promises.push(
            ParquetWriter.openFile(WeaponFireSchema, path.join(stagingArea, 'weapon_fire.parquet'))
            .then((writer) => this.weaponFireWriter = writer)
            .catch((err) => console.log(err))
        );

        promises.push(
            ParquetWriter.openFile(BombLifecycleSchema, path.join(stagingArea, 'bomb_lifecycle.parquet'))
            .then((writer) => this.bombLifecycleWriter = writer)
            .catch((err) => console.log(err))
        );

        return Promise.all(promises);
    }

    public parse(buffer: Buffer): void {
        this.registerEvents();
        this.df.parse(buffer);
    }

    public registerEvents(): void {
        // /** Triggered when the game events list is produced */
        // this.df.on('svc_GameEventList', () => {
        //     const ws = fs.createWriteStream(path.join(this.stagingArea, 'events_dump.csv'));
        //     this.df.gameEvents.gameEventList.forEach((event) => {
        //         ws.write(event.name + '\n');
        //     });
        //     ws.close();
        // });

        /** Triggered when the game starts - pre warmup */
        this.df.on('start', () => {
            const mapHeader = this.df.header;
            if (this.verboseness > 0) {
                console.log('Parsing started!');
                console.log(mapHeader);
            }
        });

        /** Triggered when the match actually starts - post warmup */
        this.df.gameEvents.on('round_announce_match_start', () => {
            this.matchHasStarted = true;
            if (this.verboseness > 0) {
                console.log('Match has started!');
            }
        });
  
        /** Triggered at the start of the round */
        this.df.gameEvents.on('round_start', () => {
            const round = this.df.gameRules.roundsPlayed;
            if (round > 0 && this.verboseness > 0) {
                console.log(`Round ${round} started!`);
            }
        });

        /** Triggered at the end of the match */
        this.df.on('end', (e) => {
            if (e.error) {
                console.log(e.error);
                return;
            }

            // Closing data streams
            this.tickWriter.close();
            this.playerDeathWriter.close();
            this.weaponFireWriter.close();
            this.utilityLifecycleWriter.close();
            this.bombLifecycleWriter.close();

            if (this.verboseness > 0) {
                console.log('Parsing ended!');
                console.log('Dumping parsed content..');
            }
        });

        /** Triggered at the end of every tick */
        this.df.on('tickend', () => {
            if (!this.matchHasStarted) return;

            // Skipping non-players (casters, GOTV, BOTs, etc) and players who are currently dead
            for (const player of _.filter(this.df.entities.players, (p) => p.health > 0)) {
                this.tickWriter.appendRow(
                    Tick.FromPlayer(this.currentTick(), this.currentRound(), player)
                );
            }
        });

        /** Triggered when the round officially ends */
        if (this.verboseness > 0) {
            this.df.gameEvents.on('round_officially_ended', () => {
                console.log('\tRound ended!');
            });
        }

        /** Triggered when a weapon is fired */
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
                this.utilityLifecycleWriter.appendRow(utilityThrownEvent);

                if (this.verboseness > 1) {
                    console.log(this.UTILITY_LIFECYCLE_TEXT(utilityThrownEvent));
                }
            }

            let weaponFire = new WeaponFire (
                this.df.currentTick,
                this.df.gameRules.roundsPlayed,
                e.userid,
                e.weapon
            );

            this.weaponFireWriter.appendRow(weaponFire);
        });

        // TODO: Place this method elsewhere!
        /**
         * Handles an event lifecycle event by generating an encapsulating relevant info
         * in an object, writing to stream and logging to screen (if set to)
         * @param eventName - The event name
         * @param eventInfo - Information regarding the event
         */
        const handleUtilityLifecycleEvent = (eventName: string, eventInfo): void => {
            const utilityLifecycleEvent = new UtilityLifecycle(
                this.currentTick(),
                this.currentRound(),
                eventName,
                eventInfo.userid,
                eventInfo.x,
                eventInfo.y,
                eventInfo.z
            );

            this.utilityLifecycleWriter.appendRow(utilityLifecycleEvent);

            if (this.verboseness > 1) {
                console.log(this.UTILITY_LIFECYCLE_TEXT(utilityLifecycleEvent));
            }
        };

        /** Triggered when an HE is detonated */
        this.df.gameEvents.on('hegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('hegrenade_detonate', e);
        });

        /** Triggered when a flashbang is detonated */
        this.df.gameEvents.on('flashbang_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('flashbang_detonate', e);
        });

        /** Triggered when a smoke grenade expires */
        this.df.gameEvents.on('smokegrenade_expired', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('smokegrenade_expired', e);
        });

        /** Triggered when a smoke grenade detonates */
        this.df.gameEvents.on('smokegrenade_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('smokegrenade_detonate', e);
        });

        // /** Triggered when a molotov detonates */
        // this.df.gameEvents.on('molotov_detonate', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('molotov_detonate', e);
        // });

        /** Triggered when an inferno starts burning */
        this.df.gameEvents.on('inferno_startburn', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('inferno_startburn', e);
        });

        /** Triggered when an inferno expires */
        this.df.gameEvents.on('inferno_expire', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('inferno_expire', e);
        });

        // /** Triggered when an inferno extinguishes */
        // this.df.gameEvents.on('inferno_extinguish', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('inferno_extinguish', e);
        // });

        /** Triggered when a decoy starts firing */
        this.df.gameEvents.on('decoy_started', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('decoy_started', e);
        });

        // /** Triggered when a decoy is firing */
        // this.df.gameEvents.on('decoy_firing', (e) => {
        //     if (!this.matchHasStarted) return;
        //     handleUtilityLifecycleEvent('decoy_firing', e);
        // });

        /** Triggered when a decoy detonates */
        this.df.gameEvents.on('decoy_detonate', (e) => {
            if (!this.matchHasStarted) return;
            handleUtilityLifecycleEvent('decoy_detonate', e);
        });

    // /**
    //  * Parses a bomb lifecycle event.
    //  * @param event - The bomb lifecycle event entity.
    //  */
    // private _parseBombLifecycleEvent(event): string {
    //     return [
    //         this.df.currentTick,
    //         this.df.gameRules.roundsPlayed,
    //         event.event,
    //         event.userid
    //     ].join(this.delimiter) + '\n';
    // }

        /** Triggered when the bomb is planted */
        this.df.gameEvents.on('bomb_planted', (e) => {
            if (!this.matchHasStarted) return;

            let event = new BombLifecycle(
                this.currentTick(),
                this.currentRound(),
                'bomb_planted',
                e.userid
            );

            this.bombLifecycleWriter.appendRow(event);
        });

        /** Triggered when the bomb is defused */
        this.df.gameEvents.on('bomb_defused', (e) => {
            if (!this.matchHasStarted) return;

            let event = new BombLifecycle(
                this.currentTick(),
                this.currentRound(),
                'bomb_defused',
                e.userid
            );

            this.bombLifecycleWriter.appendRow(event);
        });

        /** Triggered when the bomb explodes */
        this.df.gameEvents.on('bomb_exploded', (e) => {
            if (!this.matchHasStarted) return;

            let event = new BombLifecycle(
                this.currentTick(),
                this.currentRound(),
                'bomb_exploded',
                e.userid
            );

            this.bombLifecycleWriter.appendRow(event);
        });

        /** Triggered when the bomb is dropped */
        this.df.gameEvents.on('bomb_dropped', (e) => { 
            if (!this.matchHasStarted) return;

            let event = new BombLifecycle(
                this.currentTick(),
                this.currentRound(),
                'bomb_dropped',
                e.userid
            );

            this.bombLifecycleWriter.appendRow(event);
        });

        /** Triggered when the bomb is picked up */
        this.df.gameEvents.on('bomb_pickup', (e) => {
            if (!this.matchHasStarted) return;

            let event = new BombLifecycle(
                this.currentTick(),
                this.currentRound(),
                'bomb_pickup',
                e.userid
            );

            this.bombLifecycleWriter.appendRow(event);
        });

        /** Triggered when a player dies */
        this.df.gameEvents.on('player_death', (e) => {
            if (!this.matchHasStarted) return;

            let playerDeath = new PlayerDeath(
                this.df.currentTick,
                this.df.gameRules.roundsPlayed,
                e.userid,
                e.attacker,
                e.assister,
                e.assistedflash,
                e.weapon,
                e.headshot,
                e.penetrated
            );

            this.playerDeathWriter.appendRow(playerDeath);

            const victim = this.df.entities.getByUserId(e.userid);
            // saving last known stats of the killed player
            this.tickWriter.appendRow(
                Tick.FromPlayer(this.df.currentTick, this.df.gameRules.roundsPlayed, victim)
            );

            if (this.verboseness > 1) {
                const killerInfo = this.df.entities.getByUserId(e.attacker);
                console.log(`${killerInfo.name} killed ${victim.name} with ${e.weapon}`);
            }
        });

        /** When a player gets hurt */
        this.df.gameEvents.on('player_hurt', (e) => {
            if (this.verboseness > 1) {
                console.log(e);
            }
        });

        /** When a plyer is blinded */
        this.df.gameEvents.on('player_blind', (e) => {
            if (this.verboseness > 1) {
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
        const utilityLifecycleEvent = new UtilityLifecycle(
            this.currentTick(),
            this.currentRound(),
            `${utility}_thrown`,
            userId,
            position[0],
            position[1],
            position[2]
        );

        return utilityLifecycleEvent;
    }
}