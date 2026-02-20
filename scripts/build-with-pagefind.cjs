/* This is a script to build the site with Pagefind */

const { execSync } = require('child_process');
const { existsSync } = require('fs');

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

// Main function
function main() {
    const platform = detectPlatform();
    const preferredOutputDir = getPagefindOutputDir(platform);

    console.log(`🚀 Detected deployment platform: ${platform}`);
    console.log(`📁 Preferred Pagefind output directory: ${preferredOutputDir}`);

    try {
        // Best-effort: keep Decap CMS bundle same-origin for faster /admin load.
        execSync(`node scripts/fetch-decap-cms.cjs`.trim(), {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        // Run Astro build
        console.log('🔨 Running Astro build...');
        execSync(`npx astro build`.trim(), {
            stdio: 'inherit',
            cwd: process.cwd() // Ensure in the correct directory
        });

        const outputDir = resolveExistingOutputDir(preferredOutputDir);
        console.log(`📁 Pagefind output directory (resolved): ${outputDir}`);

        // Check if output directory exists
        if (!existsSync(outputDir)) {
            console.error(`❌ Output directory does not exist: ${outputDir}`);
            process.exit(1);
        }

        // Run Pagefind
        console.log(`🔍 Running Pagefind search index generation...`);
        execSync(`npx pagefind --site ${outputDir}`, {
            stdio: 'inherit',
            cwd: process.cwd() // Ensure in the correct directory
        });

        console.log('✅ Build completed!');
        console.log(`📊 Search index generated at: ${outputDir}/pagefind/`);

    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();