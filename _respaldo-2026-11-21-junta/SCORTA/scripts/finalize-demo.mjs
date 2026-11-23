import {renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
renameSync(fileURLToPath(new URL('../dist-demo/demo.html',import.meta.url)),fileURLToPath(new URL('../dist-demo/index.html',import.meta.url)));
