import { chromium, test as base, expect } from "@playwright/test";

export { expect };

export const test = base.extend({
    testBrowser: [async ({}, use) => {
        const browser = await chromium.launch({
            args: process.env.PW_SINGLE_PROCESS === "1" ? ["--single-process"] : []
        });
        await use(browser);
        await browser.close();
    }, { scope: "test" }],
    context: async ({ testBrowser }, use) => {
        const context = await testBrowser.newContext();
        await use(context);
        await context.close();
    },
    page: async ({ context }, use) => {
        const page = await context.newPage();
        await use(page);
    }
});
