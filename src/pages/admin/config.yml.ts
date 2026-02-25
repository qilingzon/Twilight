import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
    const configPath = path.join(process.cwd(), "public", "admin", "config.yml");
    const yaml = await readFile(configPath, "utf8");

    return new Response(yaml, {
        headers: {
            "Content-Type": "text/yaml; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
