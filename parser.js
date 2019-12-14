#!/usr/bin/env node

var demofile = require("demofile");
var path = require("path")
var fs = require("fs");
var _ = require("lodash");


/**
 * ARGS PARSING
 */
var args = process.argv.slice(2);

if (args.length <= 0 || !fs.existsSync(args[0])) {
  console.log("Invalid arguments! Must receive a valid demo file path to execute.");
  return;
}

var _DEMO_FILE_PATH     = args[0];
var _WORKING_DIR        = path.join(__dirname, "parsed", path.basename(_DEMO_FILE_PATH).split(".")[0]);
var _STREAM_TO_CONSOLE  = typeof(args[1]) === "string" ? args[1] === "true" : false;


/**
 * TABLE HEADERS
 */
var _TICK_TABLE_HEADERS = [
  "tick",
  "round",
  "user_id",
  "steam_id",
  "user_name",
  "health",
  "pitch",
  "yaw",
  "speed",
  "x",
  "y",
  "z",
  "place_name"
];

var _PLAYER_DEATH_TABLE_HEADERS = [
  "tick",
  "round",
  "user_id",
  "attacker",
  "assister",
  "weapon",
  "headshot",
  "penetrated"
];

var _WEAPON_FIRE_TABLE_HEADERS = [
  "tick",
  "round",
  "weapon"
];

var _UTILITY_LIFECYCLE_TABLE_HEADERS = [
  "tick",
  "round",
  "event",
  "entity_id",
  "x",
  "y",
  "z"
];


/**
  ORGANIZATIONAL SECTION:

  TABLES:
      TICKS
      EVENTS (PLAYER_DEATH, WEAPON_FIRE, UTILITY_LIFECYCLE=DETONATIONS & EXPIRATIONS)

    {TODO}

      [X] infer when game actually started;
      [X] dynamically create folder based on demo name & dumped parsed data there;
      [ ] refactor code; organize handlers within different files for improved readability;
      [X] generate "basic events" tables (player_death, weapon_fire, etc);
      [ ] figure out how to get entityid of utilities, when thrown;
 */


fs.readFile(_DEMO_FILE_PATH, (err, buffer) => {
  const df = new demofile.DemoFile();

  /**
   * CONTROL VARIABLES
   */
  var _MATCH_HAS_STARTED  = false;
  var _DUMP_EVENTS_LIST   = false;

  /**
   * FILE STREAMS
   */
  var _TICK_STREAM              = null;
  var _PLAYER_DEATH_STREAM      = null;
  var _WEAPON_FIRE_STREAM       = null;
  var _UTILITY_LIFECYCLE_STREAM = null;


  /**
   * Extracts data from the given playerInfo object.
   * @param playerInfo: the player information.
   * @returns: the parsed information.
   */
  var parsePlayerInfo = function(playerInfo) {
    var playerPosition  = playerInfo.position;
    var playerEyeAngles = playerInfo.eyeAngles;

    var data = [];
    data.push(df.currentTick);
    data.push(df.entities.gameRules.roundsPlayed);
    data.push(playerInfo.userId);
    data.push(playerInfo.steamId);
    data.push(playerInfo.name);
    data.push(playerInfo.health);
    data.push(playerEyeAngles.pitch);
    data.push(playerEyeAngles.yaw);
    data.push(playerInfo.speed);
    data.push(playerPosition.x);
    data.push(playerPosition.y);
    data.push(playerPosition.z);
    data.push(playerInfo.placeName);
    return data.join(";");
  }

  /**
   * Extracts data from the "player_death" event object.
   * @param event: the event information.
   * @returns: the parsed information.
   */
  var parsePlayerDeathEventInfo = function(event) {
    var data = [];
    data.push(df.currentTick);
    data.push(df.entities.gameRules.roundsPlayed);
    data.push(event.userid);
    data.push(event.attacker);
    data.push(event.assister);
    data.push(event.weapon);
    data.push(event.headshot);
    data.push(event.penetrated);
    return data.join(";");
  }

  /**
   * Extracts data from the "weapon_fire" event object.
   * @param event: the event information.
   * @returns: the parsed information.
   */
  var parseWeaponFireEventInfo = function(event) {
    var data = [];
    data.push(df.currentTick);
    data.push(df.entities.gameRules.roundsPlayed);
    data.push(event.weapon);
    return data.join(";");
  }

  /**
   * Extracts data from utilities' lifecycle events.
   * @param event: the event information.
   * @returns: the parsed information.
   */
  var parseUtilityLifecycleEventInfo = function(event) {
    var data = [];
    data.push(df.currentTick);
    data.push(df.entities.gameRules.roundsPlayed);
    data.push(event.event);
    data.push(event.entityid);
    data.push(event.x);
    data.push(event.y);
    data.push(event.z);
    return data.join(";");
  }


  df.on("start", () => {
    console.log("Parsing started!");

    if (!fs.existsSync(_WORKING_DIR)) {
      fs.mkdirSync(_WORKING_DIR, { recursive: true });
    }

    _TICK_STREAM = fs.createWriteStream(path.join(_WORKING_DIR, "tick.csv"));
    _TICK_STREAM.write(_TICK_TABLE_HEADERS.join(";") + "\n");

    _PLAYER_DEATH_STREAM = fs.createWriteStream(path.join(_WORKING_DIR, "player_death.csv"));
    _PLAYER_DEATH_STREAM.write(_PLAYER_DEATH_TABLE_HEADERS.join(";") + "\n");

    _WEAPON_FIRE_STREAM = fs.createWriteStream(path.join(_WORKING_DIR, "weapon_fire.csv"));
    _WEAPON_FIRE_STREAM.write(_WEAPON_FIRE_TABLE_HEADERS.join(";") + "\n");

    _UTILITY_LIFECYCLE_STREAM = fs.createWriteStream(path.join(_WORKING_DIR, "utility_lifecycle.csv"));
    _UTILITY_LIFECYCLE_STREAM.write(_UTILITY_LIFECYCLE_TABLE_HEADERS.join(";") + "\n");

    var mapHeader = df.header;
    console.log(mapHeader);
  });


  df.on("end", e => {
    _TICK_STREAM.close();
    _PLAYER_DEATH_STREAM.close();
    _WEAPON_FIRE_STREAM.close();
    _UTILITY_LIFECYCLE_STREAM.close();

    if (e.error) {
      console.log(e.error);
      return;
    }

    console.log("Parsing ended!");
    console.log("Dumping parsed content..");

    if (_DUMP_EVENTS_LIST) {
      var ws = fs.createWriteStream(path.join(_WORKING_DIR, "events_dump.csv"));
      df.gameEvents.gameEventList.forEach((event) => {
        ws.write(event.name + "\n");
      });
      ws.close();
    }
  });


  df.on("tickend", e => {
    if (!_MATCH_HAS_STARTED) return;

    // skipping non-players (casters, GOTV, BOTs, etc) and players who are currently dead
    for (var playerInfo of _.filter(df.entities.players, (p) => p.health > 0)) {
      _TICK_STREAM.write(parsePlayerInfo(playerInfo) + "\n");
    }
  });


  df.gameEvents.on("round_announce_match_start", () => {
    console.log("Match has started!");
    _MATCH_HAS_STARTED = true;
  });

  
  df.gameEvents.on("round_start", () => {
    var round = df.gameRules.roundsPlayed;
    if (round > 0) {
      console.log(`Round ${round} started!`);
    }
  });


  /*
   * df.gameEvents.on("round_end", (e) => {
   *   console.log(e);
   * });
   */


  df.gameEvents.on("round_officially_ended", (e) => {
    console.log("\tRound ended!");
  });


  df.gameEvents.on("weapon_fire", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    _WEAPON_FIRE_STREAM.write(parseWeaponFireEventInfo(e) + "\n");
  });


  df.gameEvents.on("hegrenade_detonate", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    e["event"] = "hegrenade_detonate"
    _UTILITY_LIFECYCLE_STREAM.write(parseUtilityLifecycleEventInfo(e) + "\n");
  });


  df.gameEvents.on("flashbang_detonate", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    e["event"] = "flashbang_detonate"
    _UTILITY_LIFECYCLE_STREAM.write(parseUtilityLifecycleEventInfo(e) + "\n");
  });


  df.gameEvents.on("smokegrenade_expired", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    e["event"] = "smokegrenade_expired"
    _UTILITY_LIFECYCLE_STREAM.write(parseUtilityLifecycleEventInfo(e) + "\n");
  });


  df.gameEvents.on("smokegrenade_detonate", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    e["event"] = "smokegrenade_detonate"
    _UTILITY_LIFECYCLE_STREAM.write(parseUtilityLifecycleEventInfo(e) + "\n");
  });


  df.gameEvents.on("molotov_detonate", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    e["event"] = "molotov_detonate"
    _UTILITY_LIFECYCLE_STREAM.write(parseUtilityLifecycleEventInfo(e) + "\n");
  });


  df.gameEvents.on("player_death", (e) => {
    if (!_MATCH_HAS_STARTED) return;

    _PLAYER_DEATH_STREAM.write(parsePlayerDeathEventInfo(e) + "\n");

    var victimInfo = df.entities.getByUserId(e.attacker);
    // saving last known stats of the killed player
    _TICK_STREAM.write(parsePlayerInfo(victimInfo) + "\n");

    if (_STREAM_TO_CONSOLE) {
      var killerInfo = df.entities.getByUserId(e.userid);
      console.log(`${killerInfo.name} killed ${victimInfo.name} with ${e.weapon}`);
    }
  });


  df.parse(buffer);
});
