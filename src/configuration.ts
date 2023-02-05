import envPaths from 'env-paths';
import { mkdirSync, readFileSync, existsSync, writeFileSync, write } from 'fs';
import { dirname, join } from 'path';
import { State } from './state';

export class Configuration {
    configPath: string;

    constructor(filename: string, initialState: State) {
        const paths = envPaths('SpeedSquare');

        try {
            console.log("Creating directory: " + paths.config);
            mkdirSync(paths.config, {recursive: true});
            this.configPath = join(paths.config, filename);
        } catch (e: any) {
            console.error("Error while creating config directory", e)
            process.exit(1);
        }

        // Create the settings file if it doesn't exist
        if (!existsSync(this.configPath)) {
            try {
                const data = JSON.stringify(initialState);
                writeFileSync(this.configPath, data, {flag: 'w', encoding: 'utf8'})
            } catch (e: any) {
                console.error("Error while writing initial configuration file", e)
                process.exit(1);
            }
        }
    }

    load(): State | null {
        try {
            const data = readFileSync(this.configPath, 'utf8');
            const json = JSON.parse(data);
            if (!json.app) {
                json.app = {}
            }
            return json as State;
        } catch (e: any) {
            console.error("Could not load data from the settings file!", e);
            return null;
        }
    }

    save(state: State) {
        try {
            // Save all state except the app state (like the connected status)
            const saveState = {...state} as any
            delete saveState.app;
            const data = JSON.stringify(saveState);
            writeFileSync(this.configPath, data, {flag: 'w', encoding: 'utf8'})
        } catch (e: any) {
            console.error("Error while writing the configuration file", e)
            process.exit(1);
        }
    }
}