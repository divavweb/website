import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    testMatch: "**/*.spec.mjs",
    fullyParallel: false,
    workers: 1,
    reporter: "list",
    use: {
        browserName: "chromium",
        launchOptions: {
            args: process.env.PW_SINGLE_PROCESS === "1" ? ["--single-process"] : []
        }
    }
});
