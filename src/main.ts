import * as fs from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { parse } from 'yargs';
import { Parser } from './parser';

((): void => {

    const argv = yargs.option({
        demo: { type: 'string', demandOption: true },
        verboseness: { type: 'number', default: 0 }
    }).argv;

    console.log(argv.demo);

    fs.readFile(argv.demo, (err, buffer) => {
        if (err) {
            console.log(`Couldn't read demo file: ${argv.demo}`);
            console.log(`Error: ${err}`);
        }

        const parsedPath = path.parse(argv.demo);
        // Dynamically defining the staging area
        const stagingArea = path.join(parsedPath.dir, parsedPath.name);

        const parser = new Parser(stagingArea, argv.verboseness);
        parser.parse(buffer);
    });
})();