/* This is a script to build the site with Pagefind */

const { spawn } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

// Detect the platform
function detectPlatform() {
    // Check environment variables
    if (process.env.GITHUB_ACTIONS) {
        return 'github';
    }
    if (process.env.CF_PAGES) {
        return 'cloudflare';
    }
    if (process.env.NETLIFY) {
        return 'netlify';
    }
    if (process.env.EDGEONE) {
        return 'edgeone';
    }
    if (process.env.VERCEL) {
        return 'vercel';
    }

    // Default to standard dist directory
    return 'default';
}

// Get Pagefind output directory
function getPagefindOutputDir(platform) {
    const outputDirs = {
        default: 'dist',
        github: 'dist',
        cloudflare: 'dist',
        netlify: 'dist',
        edgeone: 'dist',
        vercel: '.vercel/output/static',
    };

    return outputDirs[platform] || 'dist';
}

function resolveExistingOutputDir(preferredDir) {
    if (preferredDir && existsSync(preferredDir)) return preferredDir;

    const fallbacks = ['dist', '.vercel/output/static'];
    for (const dir of fallbacks) {
        if (existsSync(dir)) return dir;
    }

    return preferredDir;
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            cwd: process.cwd(),
            ...options,
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

// Main function
async function main() {
    const platform = detectPlatform();
    const preferredOutputDir = getPagefindOutputDir(platform);

    const nodeBin = process.execPath;
    const scriptPath = (p) => path.join('scripts', p);

    const runPnpm = (pnpmArgs) => {
        if (process.platform === 'win32') {
            return run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'pnpm', ...pnpmArgs]);
        }
        return run('pnpm', pnpmArgs);
    };

    console.log(`🚀 Detected deployment platform: ${platform}`);
    console.log(`📁 Preferred Pagefind output directory: ${preferredOutputDir}`);

    try {
        // Best-effort: keep runtime bundles same-origin.
        await Promise.all([
            run(nodeBin, [scriptPath('fetch-decap-cms.cjs')]),
            run(nodeBin, [scriptPath('fetch-mermaid.cjs')]),
            run(nodeBin, [scriptPath('fetch-iconify-icon.cjs')]),
        ]);

        // Validate Decap CMS config YAML early so a broken indent can't take down /admin in production.
        try {
            const yamlText = readFileSync(path.join('public', 'admin', 'config.yml'), 'utf8');
            require('js-yaml').load(yamlText);
            console.log('✅ Decap CMS config.yml YAML valid');
        } catch (err) {
            console.error('❌ Invalid public/admin/config.yml (YAML parse failed)');
            console.error(err && err.message ? err.message : err);
            process.exit(1);
        }

        // Run Astro build
        console.log('🔨 Running Astro build...');
        await runPnpm(['-s', 'exec', 'astro', 'build']);

        const outputDir = resolveExistingOutputDir(preferredOutputDir);
        console.log(`📁 Pagefind output directory (resolved): ${outputDir}`);

        // Check if output directory exists
        if (!existsSync(outputDir)) {
            console.error(`❌ Output directory does not exist: ${outputDir}`);
            process.exit(1);
        }

        const skipPagefind = String(process.env.SKIP_PAGEFIND || '').toLowerCase();
        if (skipPagefind === '1' || skipPagefind === 'true' || skipPagefind === 'yes') {
            console.log('⏭️  Skipping Pagefind (SKIP_PAGEFIND=1)');
        } else {
            console.log(`🔍 Running Pagefind search index generation...`);
            await runPnpm(['-s', 'exec', 'pagefind', '--site', outputDir]);
        }

        console.log('✅ Build completed!');
        console.log(`📊 Search index generated at: ${outputDir}/pagefind/`);

    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();