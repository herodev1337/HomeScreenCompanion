import { fileURLToPath, URL } from 'node:url';
import nodeResolve from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import replace from '@rollup/plugin-replace';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT = path.resolve(REPO, 'Configuration/configPage.js');

const pluginVersion = (() => {
    const versionTxt = path.resolve(__dirname, '../../version.txt');
    const txt = fs.readFileSync(versionTxt, 'utf8').trim();
    return txt || '0.0.0';
})();

const commitSha = (() => {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
})();

function rawTextPlugin() {
    return {
        name: 'raw-text-import',
        resolveId(id, importer) {
            const m = id.match(/^(.+\.(?:css|html|svg))(\?raw)$/);
            if (!m) return null;
            const rel = m[1];
            const abs = path.resolve(path.dirname(importer), rel);
            return {
                id: abs,
                moduleSideEffects: false,
                meta: { isRaw: true }
            };
        },
        load(id) {
            if (!/\.(?:css|html|svg)$/.test(id)) return null;
            const contents = fs.readFileSync(id, 'utf8');
            return {
                code: `export default ${JSON.stringify(contents)};`,
                map: null
            };
        }
    };
}

export default {
    input: 'src/modules/index.ts',
    output: {
        file: OUT,
        format: 'amd',
        exports: 'default',
        generatedCode: { constBindings: false },
        inlineDynamicImports: true,
        banner: '/* GENERATED from HomeScreenCompanion/ClientApp/src by rollup - do not edit */',
        footer: `/* Plugin v${pluginVersion}${commitSha ? '-' + commitSha : ''} */`
    },
    external: ['emby-input', 'emby-button', 'emby-select', 'emby-checkbox'],
    plugins: [
        replace({
            preventAssignment: true,
            values: {
                '__PLUGIN_VERSION__': JSON.stringify(pluginVersion)
            }
        }),
        nodeResolve({
            extensions: ['.mjs', '.ts', '.js']
        }),
        rawTextPlugin(),
        esbuild({
            target: 'es2020',
            include: /\.[cm]?tsx?$/,
            minify: true,
            legalComments: 'none'
        })
    ]
};
