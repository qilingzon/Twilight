import { readFile } from "node:fs/promises";

export async function GET() {
    const configPath = new URL("../../../../public/admin/config.yml", import.meta.url);
    const yaml = await readFile(configPath, "utf8");

    return new Response(yaml, {
        headers: {
            "Content-Type": "text/yaml; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
